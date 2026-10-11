//! lib.rs - void-engine entry point.
//!
//! A minimal renderer written in Rust against `wgpu` (the abstraction layer
//! underneath Firefox's, Servo's and Deno's WebGPU implementations),
//! compiled to `wasm32-unknown-unknown` and started from the page by one
//! exported async function, [`start`].
//!
//! Deliberately small: a render loop, one uniform buffer, one vertex buffer,
//! one index buffer, one depth texture, one pipeline. The point is not
//! feature count - it is that every layer between "Rust source" and "pixels
//! on screen" is either code I wrote or code I can read end to end.
//!
//! Design notes (each one answers a failure that actually happened):
//!
//! * `wgpu` 0.19's WebGPU backend sent a `requiredLimits` key that browsers
//!   removed from the spec (`maxInterStageShaderComponents`, gone from
//!   Chrome in version 135), so `requestDevice()` was rejected and the
//!   engine never drew a frame. Current `wgpu` no longer sends it.
//! * No window abstraction: wgpu renders straight into a `<canvas>` that
//!   this crate creates, and a `requestAnimationFrame` loop drives it. A
//!   canvas is exactly what the browser gives us, so nothing sits between
//!   the two and nothing needs an event loop that "throws on purpose".
//! * A canvas can only ever hold one kind of GPU context, so each backend
//!   attempt (WebGPU first, then WebGL2) gets a fresh canvas.
//! * Nothing in the start-up path panics. Failures come back as a rejected
//!   promise with a readable message, and the few panics that remain (a
//!   bug) are forwarded to the page through the same reporter callback, so
//!   the page can show them instead of sitting blank.

mod math;

use std::cell::{Cell, RefCell};
use std::rc::Rc;
use std::sync::Arc;

use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use wgpu::util::DeviceExt;

// ---------------------------------------------------------------------------
// Reporting to the page
// ---------------------------------------------------------------------------

thread_local! {
    /// The page's `(kind, message)` callback, registered by [`start`].
    static REPORTER: RefCell<Option<js_sys::Function>> = const { RefCell::new(None) };
    static HOOK_INSTALLED: Cell<bool> = const { Cell::new(false) };
}

/// Calls the page's reporter, if one was registered. Kinds in use:
/// `backend`, `frame`, `stats` and `error`.
fn report(kind: &str, message: &str) {
    REPORTER.with(|slot| {
        if let Some(callback) = slot.borrow().as_ref() {
            let _ = callback.call2(
                &JsValue::NULL,
                &JsValue::from_str(kind),
                &JsValue::from_str(message),
            );
        }
    });
}

/// Keeps the console panic hook and additionally forwards the panic text to
/// the page, so a bug shows up on screen instead of as a silent blank canvas.
fn install_panic_reporting() {
    if HOOK_INSTALLED.with(|flag| flag.replace(true)) {
        return;
    }
    console_error_panic_hook::set_once();
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        previous(info);
        report("error", &format!("engine panic: {info}"));
    }));
}

// ---------------------------------------------------------------------------
// GPU state
// ---------------------------------------------------------------------------

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Uniforms {
    mvp: [[f32; 4]; 4],
    time: f32,
    // Seven f32s, not three. In WGSL's uniform address space a vec3<f32>
    // has 16-byte alignment, so the shader-side `_pad: vec3<f32>` after
    // `mvp` (64 B) and `time` (4 B) lands at byte 80 and the struct rounds
    // up to 96 bytes. The field is never read; it only has to reach the same
    // total size, because wgpu checks the bound buffer against the shader's
    // computed minimum binding size.
    _pad: [f32; 7],
}

struct Gpu {
    // Instance and adapter are kept alive on purpose. In a browser, releasing
    // them lets the page's GPU adapter object be garbage-collected, after
    // which async calls on the device (buffer mapping, error scopes) fail
    // with "A valid external Instance reference no longer exists".
    _instance: wgpu::Instance,
    _adapter: wgpu::Adapter,
    canvas: web_sys::HtmlCanvasElement,
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    max_dimension: u32,
    pipeline: wgpu::RenderPipeline,
    vertex_buf: wgpu::Buffer,
    index_buf: wgpu::Buffer,
    index_count: u32,
    uniform_buf: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    depth_view: wgpu::TextureView,
    backend_name: &'static str,
}

/// Canvas size in device pixels, following its CSS box. The pixel ratio is
/// capped at 2 so a high-density phone does not pay for a canvas it cannot
/// show any extra detail on.
fn target_size(canvas: &web_sys::HtmlCanvasElement, max_dimension: u32) -> (u32, u32) {
    let ratio = web_sys::window()
        .map(|w| w.device_pixel_ratio())
        .unwrap_or(1.0)
        .clamp(1.0, 2.0);
    let scale = |css: i32| -> u32 {
        let pixels = (f64::from(css.max(1)) * ratio).round() as u32;
        pixels.clamp(1, max_dimension.max(1))
    };
    (scale(canvas.client_width()), scale(canvas.client_height()))
}

fn create_depth_view(device: &wgpu::Device, width: u32, height: u32) -> wgpu::TextureView {
    device
        .create_texture(&wgpu::TextureDescriptor {
            label: Some("depth-texture"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Depth32Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            view_formats: &[],
        })
        .create_view(&wgpu::TextureViewDescriptor::default())
}

impl Gpu {
    async fn new(
        canvas: web_sys::HtmlCanvasElement,
        backends: wgpu::Backends,
    ) -> Result<Self, String> {
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends,
            ..wgpu::InstanceDescriptor::new_without_display_handle()
        });

        let surface = instance
            .create_surface(wgpu::SurfaceTarget::Canvas(canvas.clone()))
            .map_err(|e| format!("create_surface: {e}"))?;

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
                ..Default::default()
            })
            .await
            .map_err(|e| format!("request_adapter: {e}"))?;

        let backend_name = match adapter.get_info().backend {
            wgpu::Backend::BrowserWebGpu => "WebGPU",
            wgpu::Backend::Gl => "WebGL2",
            _ => "GPU",
        };

        // Downlevel (WebGL2-class) limits are all this scene needs, and they
        // are valid on every backend; only the texture-size limits are raised
        // to whatever the adapter really offers.
        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor {
                label: Some("void-engine-device"),
                required_limits: wgpu::Limits::downlevel_webgl2_defaults()
                    .using_resolution(adapter.limits()),
                ..Default::default()
            })
            .await
            .map_err(|e| format!("request_device: {e}"))?;

        // By default wgpu panics on an uncaptured error. Log it and tell the
        // page instead; the closure captures nothing, so it is Send + Sync.
        device.on_uncaptured_error(Arc::new(|error: wgpu::Error| {
            log::error!("wgpu: {error}");
            report("error", &format!("wgpu: {error}"));
        }));

        let max_dimension = device.limits().max_texture_dimension_2d;
        let (width, height) = target_size(&canvas, max_dimension);

        let mut config = surface
            .get_default_config(&adapter, width, height)
            .ok_or_else(|| "the adapter cannot present to this canvas".to_string())?;
        // Prefer a non-sRGB target so the clear colour and the shader output
        // reach the screen exactly as written, on every backend.
        let capabilities = surface.get_capabilities(&adapter);
        if let Some(format) = capabilities.formats.iter().copied().find(|f| !f.is_srgb()) {
            config.format = format;
        }
        surface.configure(&device, &config);

        // -- Geometry: voxel sphere built in math.rs -------------------------
        let (vertices, indices) = math::build_voxel_sphere(3.2, 0.42);
        let index_count = indices.len() as u32;

        let vertex_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vertex-buffer"),
            contents: bytemuck::cast_slice(&vertices),
            usage: wgpu::BufferUsages::VERTEX,
        });
        let index_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("index-buffer"),
            contents: bytemuck::cast_slice(&indices),
            usage: wgpu::BufferUsages::INDEX,
        });

        // -- Uniforms --------------------------------------------------------
        let uniforms = Uniforms {
            mvp: [[0.0; 4]; 4],
            time: 0.0,
            _pad: [0.0; 7],
        };
        let uniform_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("uniform-buffer"),
            contents: bytemuck::bytes_of(&uniforms),
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("bind-group-layout"),
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("bind-group"),
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buf.as_entire_binding(),
            }],
        });

        // -- Shader + pipeline -----------------------------------------------
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("voxel-shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("pipeline-layout"),
            bind_group_layouts: &[Some(&bind_group_layout)],
            immediate_size: 0,
        });

        let vertex_layout = wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<math::Vertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute {
                    offset: 0,
                    shader_location: 0,
                    format: wgpu::VertexFormat::Float32x3,
                },
                wgpu::VertexAttribute {
                    offset: 12,
                    shader_location: 1,
                    format: wgpu::VertexFormat::Float32x3,
                },
                wgpu::VertexAttribute {
                    offset: 24,
                    shader_location: 2,
                    format: wgpu::VertexFormat::Float32x3,
                },
            ],
        };

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("voxel-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                compilation_options: Default::default(),
                buffers: &[Some(vertex_layout)],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: Some(wgpu::Face::Back),
                ..Default::default()
            },
            // The cubes overlap in screen space, so without a depth buffer
            // the draw order (not the geometry) would decide what is in front.
            depth_stencil: Some(wgpu::DepthStencilState {
                format: wgpu::TextureFormat::Depth32Float,
                depth_write_enabled: Some(true),
                depth_compare: Some(wgpu::CompareFunction::Less),
                stencil: wgpu::StencilState::default(),
                bias: wgpu::DepthBiasState::default(),
            }),
            multisample: wgpu::MultisampleState::default(),
            multiview_mask: None,
            cache: None,
        });

        let depth_view = create_depth_view(&device, config.width, config.height);

        Ok(Self {
            _instance: instance,
            _adapter: adapter,
            canvas,
            surface,
            device,
            queue,
            config,
            max_dimension,
            pipeline,
            vertex_buf,
            index_buf,
            index_count,
            uniform_buf,
            bind_group,
            depth_view,
            backend_name,
        })
    }

    fn resize(&mut self, width: u32, height: u32) {
        self.config.width = width;
        self.config.height = height;
        self.canvas.set_width(width);
        self.canvas.set_height(height);
        self.surface.configure(&self.device, &self.config);
        self.depth_view = create_depth_view(&self.device, width, height);
    }

    /// Draws one frame. Returns `true` if a frame was actually presented.
    fn render(&mut self, time: f32) -> bool {
        let (width, height) = target_size(&self.canvas, self.max_dimension);
        if (width, height) != (self.config.width, self.config.height) {
            self.resize(width, height);
        }

        // A portrait phone is narrower than the sphere at the desktop camera
        // distance, so pull the camera back until the whole sphere fits.
        let aspect = self.config.width as f32 / self.config.height as f32;
        let distance = 9.0_f32.max(8.6 / aspect.min(1.0));
        let mvp = math::build_mvp(aspect, time, distance);

        let uniforms = Uniforms {
            mvp: mvp.to_cols_array_2d(),
            time,
            _pad: [0.0; 7],
        };
        self.queue
            .write_buffer(&self.uniform_buf, 0, bytemuck::bytes_of(&uniforms));

        let frame = match self.surface.get_current_texture() {
            wgpu::CurrentSurfaceTexture::Success(frame)
            | wgpu::CurrentSurfaceTexture::Suboptimal(frame) => frame,
            wgpu::CurrentSurfaceTexture::Outdated | wgpu::CurrentSurfaceTexture::Lost => {
                self.surface.configure(&self.device, &self.config);
                return false;
            }
            _ => return false,
        };
        let view = frame
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("render-encoder"),
            });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("render-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.039,
                            g: 0.031,
                            b: 0.071,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: Some(wgpu::RenderPassDepthStencilAttachment {
                    view: &self.depth_view,
                    depth_ops: Some(wgpu::Operations {
                        load: wgpu::LoadOp::Clear(1.0),
                        store: wgpu::StoreOp::Discard,
                    }),
                    stencil_ops: None,
                }),
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });

            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.set_vertex_buffer(0, self.vertex_buf.slice(..));
            pass.set_index_buffer(self.index_buf.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..self.index_count, 0, 0..1);
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        self.queue.present(frame);
        true
    }
}

// ---------------------------------------------------------------------------
// Page integration
// ---------------------------------------------------------------------------

fn make_canvas(
    document: &web_sys::Document,
    container: &web_sys::Element,
) -> Result<web_sys::HtmlCanvasElement, String> {
    let canvas = document
        .create_element("canvas")
        .map_err(|e| format!("create canvas: {e:?}"))?
        .dyn_into::<web_sys::HtmlCanvasElement>()
        .map_err(|_| "the created element is not a canvas".to_string())?;
    let _ = canvas.set_attribute("style", "display:block;width:100%;height:100%");
    let _ = canvas.set_attribute("aria-hidden", "true");
    container
        .append_child(&canvas)
        .map_err(|e| format!("attach canvas: {e:?}"))?;
    Ok(canvas)
}

/// A requestAnimationFrame callback; it is stored behind `Rc<RefCell<..>>` so
/// the loop can re-register itself.
type FrameCallback = Closure<dyn FnMut(f64)>;

fn request_frame(callback: &FrameCallback) {
    if let Some(window) = web_sys::window() {
        let _ = window.request_animation_frame(callback.as_ref().unchecked_ref());
    }
}

/// Starts the requestAnimationFrame loop. The loop owns the GPU state and
/// keeps itself alive by re-registering its own closure every frame.
fn start_loop(gpu: Gpu, reduce_motion: bool) {
    let gpu = Rc::new(RefCell::new(gpu));
    let slot: Rc<RefCell<Option<FrameCallback>>> = Rc::new(RefCell::new(None));
    let next = slot.clone();

    let mut first_timestamp: Option<f64> = None;
    let mut reported_first_frame = false;
    let mut window_start = 0.0_f64;
    let mut frames_in_window = 0_u32;

    *slot.borrow_mut() = Some(Closure::wrap(Box::new(move |timestamp: f64| {
        let origin = *first_timestamp.get_or_insert(timestamp);
        // Reduced motion freezes the only source of continuous motion.
        let time = if reduce_motion {
            0.0
        } else {
            ((timestamp - origin) / 1000.0) as f32
        };

        let mut gpu = gpu.borrow_mut();
        if gpu.render(time) {
            frames_in_window += 1;
            if !reported_first_frame {
                reported_first_frame = true;
                window_start = timestamp;
                report("frame", "first frame presented");
            }
        }
        if reported_first_frame && timestamp - window_start >= 1000.0 {
            let fps = f64::from(frames_in_window) * 1000.0 / (timestamp - window_start);
            report(
                "stats",
                &format!(
                    "{}  {}x{}  {:.0} fps",
                    gpu.backend_name, gpu.config.width, gpu.config.height, fps
                ),
            );
            window_start = timestamp;
            frames_in_window = 0;
        }
        drop(gpu);

        if let Some(callback) = next.borrow().as_ref() {
            request_frame(callback);
        }
    }) as Box<dyn FnMut(f64)>));

    let first = slot.borrow();
    if let Some(callback) = first.as_ref() {
        request_frame(callback);
    }
}

async fn run(container_id: &str) -> Result<(), String> {
    let window = web_sys::window().ok_or_else(|| "no window object".to_string())?;
    let document = window
        .document()
        .ok_or_else(|| "no document object".to_string())?;
    let container = document
        .get_element_by_id(container_id)
        .ok_or_else(|| format!("element #{container_id} not found"))?;

    let reduce_motion = window
        .match_media("(prefers-reduced-motion: reduce)")
        .ok()
        .flatten()
        .map(|query| query.matches())
        .unwrap_or(false);

    // WebGPU where the browser has it, WebGL2 otherwise. Each attempt gets a
    // fresh canvas because a canvas keeps whichever context type it got first.
    let mut failures: Vec<String> = Vec::new();
    for (label, backends) in [
        ("WebGPU", wgpu::Backends::BROWSER_WEBGPU),
        ("WebGL2", wgpu::Backends::GL),
    ] {
        let canvas = make_canvas(&document, &container)?;
        match Gpu::new(canvas.clone(), backends).await {
            Ok(gpu) => {
                report("backend", gpu.backend_name);
                start_loop(gpu, reduce_motion);
                return Ok(());
            }
            Err(reason) => {
                log::warn!("{label} path failed: {reason}");
                failures.push(format!("{label} - {reason}"));
                canvas.remove();
            }
        }
    }
    Err(format!("no usable GPU backend ({})", failures.join("; ")))
}

/// Entry point called by the page after the wasm module is initialised.
///
/// Resolves once the engine has a device and its render loop is scheduled;
/// rejects with a readable message if no backend could be started.
/// `reporter(kind, message)` receives `backend`, `frame`, `stats` and
/// `error` events for the page to display.
#[wasm_bindgen]
pub async fn start(container_id: String, reporter: js_sys::Function) -> Result<(), JsValue> {
    REPORTER.with(|slot| *slot.borrow_mut() = Some(reporter));
    install_panic_reporting();
    let _ = console_log::init_with_level(log::Level::Info);
    run(&container_id).await.map_err(|e| JsValue::from_str(&e))
}
