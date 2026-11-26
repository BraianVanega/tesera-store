"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Antifaz 3D del hero (docs/02, ref: design/reference/Desktop.dc.html → start(el)).
 * Dos mitades extruidas: oro rosa metálico y vino con clearcoat, entorno PMREM de estudio.
 * Intro 2,6 s y ciclo de 10 s; inclinación con el mouse; reduced-motion → pose unida estática.
 * Se quita (onFail) sin WebGL, con renderer por software o si la máquina no sostiene 20 fps.
 */

const LEFT = {
  outer: [
    [2, 50],
    [50, 22],
    [54, 42],
    [46, 58],
    [50, 78],
  ],
  hole: [
    [16, 50],
    [29, 43],
    [40, 50],
    [29, 57],
  ],
};
const RIGHT = {
  outer: [
    [50, 22],
    [98, 50],
    [50, 78],
    [46, 58],
    [54, 42],
  ],
  hole: [
    [60, 50],
    [71, 43],
    [84, 50],
    [71, 57],
  ],
};

function half({ outer, hole }: { outer: number[][]; hole: number[][] }) {
  const pts = (a: number[][]) => a.map(([x, y]) => new THREE.Vector2(x! - 50, -(y! - 50)));
  const shape = new THREE.Shape(pts(outer));
  shape.holes.push(new THREE.Path(pts(hole)));
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 9,
    bevelEnabled: true,
    bevelThickness: 1.8,
    bevelSize: 1.3,
    bevelSegments: 5,
    curveSegments: 4,
  });
  geo.translate(0, 0, -4.5);
  return geo;
}

const smooth = (x: number) => x * x * (3 - 2 * x);

export default function HeroMask3D({ onFail }: { onFail: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      onFail();
      return;
    }
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      if (/swiftshader|llvmpipe|software|basic render/i.test(gpu)) {
        renderer.dispose();
        onFail();
        return;
      }
    } catch {}

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
    camera.position.set(0, 0, 270);

    // Entorno de estudio: cajas de luz cálidas y un destello vino
    const env = new THREE.Scene();
    const disposables: { dispose(): void }[] = [];
    const sphereGeo = new THREE.SphereGeometry(50, 32, 16);
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0x1d1311, side: THREE.BackSide });
    env.add(new THREE.Mesh(sphereGeo, sphereMat));
    disposables.push(sphereGeo, sphereMat);
    const panel = (w: number, h: number, color: number, x: number, y: number, z: number) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, y, z);
      mesh.lookAt(0, 0, 0);
      env.add(mesh);
      disposables.push(g, m);
    };
    panel(30, 18, 0xffe6cf, -18, 22, 20);
    panel(10, 34, 0xf2a48a, 30, 6, 10);
    panel(26, 8, 0xffffff, 0, -24, 22);
    panel(14, 14, 0x8c2f3c, -30, -6, -10);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(env, 0.02);
    scene.environment = envRT.texture;
    pmrem.dispose();

    // three ≥ r155 usa unidades físicas: × π para igualar la referencia (three 0.149, luces legacy).
    const key = new THREE.DirectionalLight(0xfff0e0, 1.2 * Math.PI);
    key.position.set(60, 90, 140);
    const rim = new THREE.DirectionalLight(0xe3a98a, 0.9 * Math.PI);
    rim.position.set(-120, 20, -60);
    scene.add(key, rim);

    const leftMat = new THREE.MeshPhysicalMaterial({
      color: 0xd9a27e,
      metalness: 0.95,
      roughness: 0.26,
      clearcoat: 0.5,
      clearcoatRoughness: 0.2,
    });
    const rightMat = new THREE.MeshPhysicalMaterial({
      color: 0x8c2f3c,
      metalness: 0.3,
      roughness: 0.28,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    const left = new THREE.Mesh(half(LEFT), leftMat);
    const right = new THREE.Mesh(half(RIGHT), rightMat);
    disposables.push(left.geometry, right.geometry, leftMat, rightMat, envRT);
    const group = new THREE.Group();
    group.add(left, right);
    scene.add(group);

    const size = () => {
      const w = Math.max(1, host.clientWidth);
      const h = Math.max(1, host.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // Que el antifaz entre siempre: distancia según el lado más chico
      const need = 150;
      const k = 2 * Math.tan((camera.fov * Math.PI) / 360);
      camera.position.z = Math.max((need / k) * 0.9, need / camera.aspect / k);
      camera.updateProjectionMatrix();
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);

    const mouse = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);

    let ry = 0;
    let rx = 0;
    let raf = 0;
    let slow = 0;
    let last = 0;
    let stopped = false;
    const t0 = performance.now();

    const frame = (now: number) => {
      if (stopped) return;
      const t = (now - t0) / 1000;
      // Si en los primeros 6 s hay ≥ 20 frames de más de 50 ms, se quita el 3D
      if (last && t < 6 && now - last > 50) slow++;
      last = now;
      if (slow >= 20) {
        onFail();
        return;
      }
      let sep = 1 - smooth(Math.min(1, t / 2.6));
      if (t > 2.6) {
        const ph = ((t - 2.6) % 10) / 10;
        let k = 0;
        if (ph >= 0.35 && ph < 0.5) k = smooth((ph - 0.35) / 0.15);
        else if (ph >= 0.5 && ph < 0.72) k = 1;
        else if (ph >= 0.72 && ph < 0.87) k = 1 - smooth((ph - 0.72) / 0.15);
        sep = 0.16 * (1 - k);
      }
      if (reduce) sep = 0;
      left.position.set(-1.2 - 70 * sep, 2.4 + 38 * sep, -50 * sep);
      right.position.set(1.2 + 70 * sep, -2.4 - 38 * sep, 50 * sep);
      left.rotation.set(0.5 * sep, -0.6 * sep, 0.25 * sep);
      right.rotation.set(-0.5 * sep, 0.6 * sep, -0.25 * sep);
      const idleY = reduce ? 0.35 : Math.sin(t * 0.45) * 0.32 + 0.18;
      const idleX = reduce ? 0 : Math.sin(t * 0.37) * 0.07;
      ry += (idleY + mouse.x * 0.45 - ry) * 0.06;
      rx += (idleX + mouse.y * 0.25 - rx) * 0.06;
      group.rotation.set(rx, ry, 0);
      group.position.y = reduce ? 0 : Math.sin(t * 0.8) * 1.6;
      renderer.render(scene, camera);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      ro.disconnect();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, [onFail]);

  return <canvas ref={ref} />;
}
