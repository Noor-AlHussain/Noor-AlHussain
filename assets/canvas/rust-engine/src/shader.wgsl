// shader.wgsl — voxel sphere render shader
// Compiled and bound from Rust via wgpu; runs identically whether the host
// binary targets native Vulkan/Metal/DX12 or WebGPU-in-browser, since wgpu
// abstracts all four backends behind one WGSL shader source.

struct Uniforms {
    mvp:   mat4x4<f32>,
    time:  f32,
    _pad:  vec3<f32>,
}

@group(0) @binding(0) var<uniform> u: Uniforms;

struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal:   vec3<f32>,
    @location(2) color:    vec3<f32>,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_normal: vec3<f32>,
    @location(1) color: vec3<f32>,
    @location(2) world_pos: vec3<f32>,
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    // Slow self-rotation so the sphere reads as alive without input
    let angle = u.time * 0.25;
    let c = cos(angle);
    let s = sin(angle);
    let rotated = vec3<f32>(
        in.position.x * c - in.position.z * s,
        in.position.y,
        in.position.x * s + in.position.z * c,
    );

    out.clip_position = u.mvp * vec4<f32>(rotated, 1.0);
    out.world_normal   = vec3<f32>(
        in.normal.x * c - in.normal.z * s,
        in.normal.y,
        in.normal.x * s + in.normal.z * c,
    );
    out.world_pos = rotated;
    out.color = in.color;
    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Two-light setup: a cyan key light and a violet rim light, matching
    // the cyan/violet palette used across every other scene in the portfolio.
    let key_dir = normalize(vec3<f32>(0.4, 0.8, 0.6));
    let rim_dir = normalize(vec3<f32>(-0.6, -0.2, -0.5));

    let key = max(dot(in.world_normal, key_dir), 0.0);
    let rim = max(dot(in.world_normal, rim_dir), 0.0);

    let key_color = vec3<f32>(0.0, 1.0, 1.0)   * key * 0.8;
    let rim_color = vec3<f32>(0.54, 0.17, 0.89) * rim * 0.5;

    let ambient = in.color * 0.25;
    var final_color = ambient + key_color * in.color + rim_color;

    // Subtle pulse synced with the sphere's self-rotation period
    let pulse = 0.92 + 0.08 * sin(u.time * 1.8);
    final_color *= pulse;

    return vec4<f32>(final_color, 1.0);
}
