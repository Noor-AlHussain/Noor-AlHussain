/**
 * build-skills-json.js
 * Generates the skills.json data file used by the D3-force skill universe.
 * Output: assets/canvas/skill-universe/data/skills.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, '..', 'assets', 'canvas', 'skill-universe', 'data');

mkdirSync(OUT_DIR, { recursive: true });

const data = {
  nodes: [
    // Domain nodes
    { id:'kernel',   label:'KERNEL',    type:'domain', color:'#00ffff', size:18, desc:'OS & Systems' },
    { id:'security', label:'SECURITY',  type:'domain', color:'#ff003c', size:18, desc:'Offensive & Defensive' },
    { id:'ai',       label:'AI',        type:'domain', color:'#ff6600', size:16, desc:'ML & Inference' },
    { id:'web',      label:'WEB',       type:'domain', color:'#8a2be2', size:16, desc:'Full Stack' },
    { id:'hardware', label:'HARDWARE',  type:'domain', color:'#00ff41', size:16, desc:'Physical & Embedded' },
    { id:'lang',     label:'LANG',      type:'domain', color:'#ffffff', size:14, desc:'Compiler & PL Design' },
    // Skill nodes
    { id:'c',         label:'C',         type:'skill', color:'#00ffff', parent:'kernel',   size:10 },
    { id:'cpp',       label:'C++',       type:'skill', color:'#00dddd', parent:'kernel',   size:10 },
    { id:'asm',       label:'ASM',       type:'skill', color:'#00bbbb', parent:'kernel',   size:8  },
    { id:'linux',     label:'Linux',     type:'skill', color:'#00aaaa', parent:'kernel',   size:9  },
    { id:'gdb',       label:'GDB',       type:'skill', color:'#009999', parent:'kernel',   size:7  },
    { id:'qemu',      label:'QEMU',      type:'skill', color:'#008888', parent:'kernel',   size:7  },
    { id:'pwn',       label:'PWN',       type:'skill', color:'#ff003c', parent:'security', size:10 },
    { id:'re',        label:'RE',        type:'skill', color:'#ff2244', parent:'security', size:10 },
    { id:'vuln',      label:'VULN',      type:'skill', color:'#ff4466', parent:'security', size:9  },
    { id:'crypto',    label:'CRYPTO',    type:'skill', color:'#ff6688', parent:'security', size:8  },
    { id:'ghidra',    label:'Ghidra',    type:'skill', color:'#ff8899', parent:'security', size:7  },
    { id:'ml',        label:'ML',        type:'skill', color:'#ff6600', parent:'ai',       size:10 },
    { id:'python',    label:'Python',    type:'skill', color:'#ff8800', parent:'ai',       size:10 },
    { id:'pytorch',   label:'PyTorch',   type:'skill', color:'#ffaa00', parent:'ai',       size:9  },
    { id:'whisper',   label:'Whisper',   type:'skill', color:'#ffcc00', parent:'ai',       size:8  },
    { id:'cuda',      label:'CUDA',      type:'skill', color:'#ffee00', parent:'ai',       size:7  },
    { id:'react',     label:'React',     type:'skill', color:'#8a2be2', parent:'web',      size:10 },
    { id:'fastapi',   label:'FastAPI',   type:'skill', color:'#aa44ff', parent:'web',      size:9  },
    { id:'flutter',   label:'Flutter',   type:'skill', color:'#cc66ff', parent:'web',      size:9  },
    { id:'webgl',     label:'WebGL',     type:'skill', color:'#ee88ff', parent:'web',      size:8  },
    { id:'jtag',      label:'JTAG',      type:'skill', color:'#00ff41', parent:'hardware', size:9  },
    { id:'uefi',      label:'UEFI',      type:'skill', color:'#22ff66', parent:'hardware', size:8  },
    { id:'sidechan',  label:'SideCh',    type:'skill', color:'#44ff88', parent:'hardware', size:8  },
    { id:'firmware',  label:'Firmware',  type:'skill', color:'#66ffaa', parent:'hardware', size:9  },
    { id:'compilers', label:'Compilers', type:'skill', color:'#ffffff', parent:'lang',     size:10 },
    { id:'rust',      label:'Rust',      type:'skill', color:'#dddddd', parent:'lang',     size:9  },
    { id:'llvm',      label:'LLVM',      type:'skill', color:'#bbbbbb', parent:'lang',     size:8  },
    { id:'glsl',      label:'GLSL',      type:'skill', color:'#999999', parent:'lang',     size:7  },
  ],
  links: [],
};

// Build links from parent field
data.nodes.filter(n => n.parent).forEach(n => {
  data.links.push({ source: n.parent, target: n.id, value: 1 });
});

// Cross-domain links (skills that span domains)
const crossLinks = [
  ['crypto',    'lang',     0.5],
  ['pwn',       'kernel',   0.6],
  ['firmware',  'kernel',   0.5],
  ['cuda',      'hardware', 0.4],
  ['webgl',     'lang',     0.3],
  ['glsl',      'web',      0.4],
  ['re',        'kernel',   0.4],
];

crossLinks.forEach(([s, t, v]) => {
  data.links.push({ source: s, target: t, value: v, cross: true });
});

writeFileSync(join(OUT_DIR, 'skills.json'), JSON.stringify(data, null, 2));
console.log('skills.json written —', data.nodes.length, 'nodes,', data.links.length, 'links');
