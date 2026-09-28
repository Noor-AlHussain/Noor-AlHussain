//! math.rs — geometry generation for the voxel sphere.
//!
//! Uses `glam` for the underlying Vec3/Mat4 algebra (battle-tested, SIMD-friendly)
//! rather than hand-rolling matrix math — the engineering judgment here is the
//! same one applied to systems work generally: don't reinvent primitives that
//! a well-audited library already gets right, reserve custom code for the parts
//! that are actually novel (the render pipeline, the voxel layout, the shaders).

use glam::{Mat4, Vec3};

#[repr(C)]
#[derive(Copy, Clone, Debug, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Vertex {
    pub position: [f32; 3],
    pub normal:   [f32; 3],
    pub color:    [f32; 3],
}

/// Generates a voxelized sphere: a cubic grid of small cubes, keeping only
/// the cubes whose center falls within `radius` of the origin. This produces
/// the "exploded silicon" / Minecraft-sphere aesthetic rather than a smooth
/// UV sphere — deliberately so, to visually echo the CPU-die scene's
/// silicon-block language elsewhere in the portfolio.
pub fn build_voxel_sphere(radius: f32, voxel_size: f32) -> (Vec<Vertex>, Vec<u32>) {
    let mut vertices = Vec::new();
    let mut indices  = Vec::new();

    let steps = (radius * 2.0 / voxel_size).ceil() as i32;
    let half  = steps / 2;

    for x in -half..half {
        for y in -half..half {
            for z in -half..half {
                let center = Vec3::new(
                    x as f32 * voxel_size,
                    y as f32 * voxel_size,
                    z as f32 * voxel_size,
                );
                if center.length() > radius {
                    continue;
                }
                let t = (center.length() / radius).clamp(0.0, 1.0);
                // Color gradient: cyan core -> violet edge, matching the
                // site-wide design tokens (#00ffff -> #8a2be2).
                let color = [
                    0.0 * (1.0 - t) + 0.541 * t,
                    1.0 * (1.0 - t) + 0.169 * t,
                    1.0 * (1.0 - t) + 0.886 * t,
                ];
                push_cube(&mut vertices, &mut indices, center, voxel_size * 0.46, color);
            }
        }
    }

    (vertices, indices)
}

fn push_cube(verts: &mut Vec<Vertex>, idx: &mut Vec<u32>, c: Vec3, s: f32, color: [f32; 3]) {
    let base = verts.len() as u32;

    // 6 faces x 4 verts, with per-face normals for correct lighting
    const FACES: [([f32; 3], [[f32; 3]; 4]); 6] = [
        ([0.0, 0.0, 1.0],  [[-1.0,-1.0,1.0],[1.0,-1.0,1.0],[1.0,1.0,1.0],[-1.0,1.0,1.0]]),
        ([0.0, 0.0, -1.0], [[1.0,-1.0,-1.0],[-1.0,-1.0,-1.0],[-1.0,1.0,-1.0],[1.0,1.0,-1.0]]),
        ([1.0, 0.0, 0.0],  [[1.0,-1.0,1.0],[1.0,-1.0,-1.0],[1.0,1.0,-1.0],[1.0,1.0,1.0]]),
        ([-1.0, 0.0, 0.0], [[-1.0,-1.0,-1.0],[-1.0,-1.0,1.0],[-1.0,1.0,1.0],[-1.0,1.0,-1.0]]),
        ([0.0, 1.0, 0.0],  [[-1.0,1.0,1.0],[1.0,1.0,1.0],[1.0,1.0,-1.0],[-1.0,1.0,-1.0]]),
        ([0.0, -1.0, 0.0], [[-1.0,-1.0,-1.0],[1.0,-1.0,-1.0],[1.0,-1.0,1.0],[-1.0,-1.0,1.0]]),
    ];

    for (face_idx, (normal, corners)) in FACES.iter().enumerate() {
        for corner in corners {
            verts.push(Vertex {
                position: [c.x + corner[0]*s, c.y + corner[1]*s, c.z + corner[2]*s],
                normal: *normal,
                color,
            });
        }
        let f = base + (face_idx as u32 * 4);
        idx.extend_from_slice(&[f, f+1, f+2, f, f+2, f+3]);
    }
}

/// Standard perspective-view-projection composition, exposed for the renderer.
pub fn build_mvp(aspect: f32, time: f32, distance: f32) -> Mat4 {
    let proj = Mat4::perspective_rh(45f32.to_radians(), aspect, 0.1, 100.0);
    let eye  = Vec3::new(
        distance * time.cos() * 0.3,
        distance * 0.4,
        distance * (time.sin() * 0.3 + 1.0),
    );
    let view = Mat4::look_at_rh(eye, Vec3::ZERO, Vec3::Y);
    proj * view
}
