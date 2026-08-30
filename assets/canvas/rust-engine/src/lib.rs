//! lib.rs — void-engine entry point.
//!
//! A minimal renderer written in Rust against `wgpu` (the same abstraction
//! layer that sits underneath Firefox's and Deno's WebGPU implementations),
//! compiled to `wasm32-unknown-unknown` and run in the browser via the
//! WebGPU backend `wgpu` selects automatically.
//!
//! This is deliberately small: a render loop, a uniform buffer, one vertex
//! buffer, one index buffer, one pipeline. The point is not feature count —
//! it's that every layer between "Rust source" and "pixels on screen" is
//! either something I wrote or something I can read end to end (wgpu's
//! source is fully auditable, unlike a black-box engine binary).

mod math;

use std::sync::Arc;
use wasm_bindgen::prelude::*;
use wgpu::util::DeviceExt;
use winit::{
    event::{Event, WindowEvent},
    event_loop::EventLoop,
    window::WindowBuilder,
    platform::web::WindowExtWebSys,
};

#[repr(C)]
#[derive(Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Uniforms {
    mvp:  [[f32; 4]; 4],
    time: f32,
    // Seven f32s, not three. WGSL's uniform-address-space layout rules
    // give vec3<f32> a 16-byte alignment (same as vec4), even though its
    // own size is 12 bytes — so on the shader side, `_pad: vec3<f32>`
    // after `mvp` (64B) + `time` (4B, ending at byte 68) lands at byte 80,
    // not 68, and the whole struct then rounds up to a 96-byte total to
    // satisfy that same 16-byte struct alignment. A plain repr(C)
    // [f32; 3] on this side has no such alignment bump — it would sit
    // right after `time` with no gap, giving 80 bytes total, 16 bytes
    // short of what the shader's struct actually requires. Since
    // min_binding_size is None below, wgpu checks the bound buffer's
    // real size against that shader-computed 96-byte minimum at
    // bind-group creation, so an 80-byte buffer fails validation. This
    // field is never read on the shader side, so it only has to reach
    // the same total size, not mirror WGSL's exact internal gap —
    // seven f32s here (28 bytes) makes mvp + time + _pad = 96 bytes to
    // match. (Logic reviewed against the WGSL and repr(C) layout rules;
    // not run against a real compiler or WebGPU context in this
    // environment.)
    _pad: [f32; 7],
}

struct State {
    surface:      wgpu::Surface<'static>,
    device:       wgpu::Device,
    queue:        wgpu::Queue,
    config:       wgpu::SurfaceConfiguration,
    pipeline:     wgpu::RenderPipeline,
    vertex_buf:   wgpu::Buffer,
    index_buf:    wgpu::Buffer,
    index_count:  u32,
    uniform_buf:  wgpu::Buffer,
    bind_group:   wgpu::BindGroup,
    start_time:   f64,
    reduce_motion: bool,
}

impl State {
    async fn new(window: Arc<winit::window::Window>) -> Self {
        let size = window.inner_size();

        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..Default::default()
        });

        let surface = instance.create_surface(window.clone()).unwrap();

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .expect("no suitable GPU adapter — WebGPU may be unavailable in this browser");

        let (device, queue) = adapter
            .request_device(&wgpu::DeviceDescriptor::default(), None)
            .await
            .expect("failed to create device");

        let surface_caps = surface.get_capabilities(&adapter);
        let format = surface_caps.formats[0];

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format,
            width:  size.width.max(1),
            height: size.height.max(1),
            present_mode: wgpu::PresentMode::Fifo,
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        // ── Geometry — voxel sphere built in math.rs ────────────────────
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

        // ── Uniforms ──────────────────────────────────────────────────
        let uniforms = Uniforms { mvp: [[0.0; 4]; 4], time: 0.0, _pad: [0.0; 7] };
        let uniform_buf = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("uniform-buffer"),
            contents: bytemuck::cast_slice(&[uniforms]),
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

        // ── Shader + pipeline ────────────────────────────────────────────
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("voxel-shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("pipeline-layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let vertex_layout = wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<math::Vertex>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &[
                wgpu::VertexAttribute { offset: 0,  shader_location: 0, format: wgpu::VertexFormat::Float32x3 },
                wgpu::VertexAttribute { offset: 12, shader_location: 1, format: wgpu::VertexFormat::Float32x3 },
                wgpu::VertexAttribute { offset: 24, shader_location: 2, format: wgpu::VertexFormat::Float32x3 },
            ],
        };

        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("voxel-pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[vertex_layout],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                cull_mode: Some(wgpu::Face::Back),
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        let start_time = js_sys::Date::now();

        // Read the OS/browser reduced-motion preference directly — this is
        // the render loop's only source of continuous motion (the voxel
        // sphere's rotation is entirely time-driven), so freezing `time` in
        // render() when this is set is the WASM-side equivalent of the
        // matchMedia('(prefers-reduced-motion: reduce)') gates already
        // applied to every other scene's JS render loop.
        let reduce_motion = web_sys::window()
            .and_then(|w| w.match_media("(prefers-reduced-motion: reduce)").ok().flatten())
            .map(|mql| mql.matches())
            .unwrap_or(false);

        Self {
            surface, device, queue, config, pipeline,
            vertex_buf, index_buf, index_count,
            uniform_buf, bind_group, start_time, reduce_motion,
        }
    }

    fn resize(&mut self, w: u32, h: u32) {
        if w == 0 || h == 0 { return; }
        self.config.width  = w;
        self.config.height = h;
        self.surface.configure(&self.device, &self.config);
    }

    fn render(&mut self) {
        let time = if self.reduce_motion {
            0.0
        } else {
            ((js_sys::Date::now() - self.start_time) / 1000.0) as f32
        };
        let aspect = self.config.width as f32 / self.config.height as f32;
        let mvp = math::build_mvp(aspect, time, 9.0);

        let uniforms = Uniforms { mvp: mvp.to_cols_array_2d(), time, _pad: [0.0; 7] };
        self.queue.write_buffer(&self.uniform_buf, 0, bytemuck::cast_slice(&[uniforms]));

        let frame = match self.surface.get_current_texture() {
            Ok(f) => f,
            Err(_) => return,
        };
        let view = frame.texture.create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("render-encoder"),
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("render-pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color { r: 0.039, g: 0.031, b: 0.071, a: 1.0 }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &self.bind_group, &[]);
            pass.set_vertex_buffer(0, self.vertex_buf.slice(..));
            pass.set_index_buffer(self.index_buf.slice(..), wgpu::IndexFormat::Uint32);
            pass.draw_indexed(0..self.index_count, 0, 0..1);
        }

        self.queue.submit(std::iter::once(encoder.finish()));
        frame.present();
    }
}

#[wasm_bindgen(start)]
pub fn run() {
    console_error_panic_hook::set_once();
    console_log::init_with_level(log::Level::Info).ok();

    wasm_bindgen_futures::spawn_local(async {
        let event_loop = EventLoop::new().unwrap();
        let window = Arc::new(
            WindowBuilder::new()
                .with_title("void-engine")
                .build(&event_loop)
                .unwrap(),
        );

        // Attach canvas to the page's #void-engine-canvas container
        web_sys::window()
            .and_then(|w| w.document())
            .and_then(|d| d.get_element_by_id("void-engine-canvas"))
            .and_then(|el| {
                let canvas = window.canvas()?;
                el.append_child(&canvas).ok()
            });

        let mut state = State::new(window.clone()).await;

        event_loop.run(move |event, target| {
            if let Event::WindowEvent { event, .. } = event {
                match event {
                    WindowEvent::Resized(size) => state.resize(size.width, size.height),
                    WindowEvent::RedrawRequested => {
                        state.render();
                        window.request_redraw();
                    }
                    WindowEvent::CloseRequested => target.exit(),
                    _ => {}
                }
            }
        }).unwrap();
    });
}
