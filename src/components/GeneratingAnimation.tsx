'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

const PARTICLE_COUNT = 200
const CONNECTION_DISTANCE = 28
const BOUNDS = 60

export default function GeneratingAnimation() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.setClearColor(0x0a0a12, 1)
    container.appendChild(renderer.domElement)

    // Scene + camera
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000)
    camera.position.z = 120

    // Particles
    const positions = new Float32Array(PARTICLE_COUNT * 3)
    const velocities: THREE.Vector3[] = []
    const phases = new Float32Array(PARTICLE_COUNT)

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * BOUNDS * 2
      positions[i * 3 + 1] = (Math.random() - 0.5) * BOUNDS * 2
      positions[i * 3 + 2] = (Math.random() - 0.5) * BOUNDS
      velocities.push(new THREE.Vector3(
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.08,
        (Math.random() - 0.5) * 0.04,
      ))
      phases[i] = Math.random() * Math.PI * 2
    }

    const particleGeo = new THREE.BufferGeometry()
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const particleMat = new THREE.PointsMaterial({
      color: 0x818cf8,
      size: 1.4,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
    })

    const points = new THREE.Points(particleGeo, particleMat)
    scene.add(points)

    // Lines geometry (pre-allocated, updated each frame)
    const MAX_LINES = PARTICLE_COUNT * 8
    const linePositions = new Float32Array(MAX_LINES * 6)
    const lineColors = new Float32Array(MAX_LINES * 6)
    const lineGeo = new THREE.BufferGeometry()
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage))
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage))

    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.25,
    })
    const lineSegs = new THREE.LineSegments(lineGeo, lineMat)
    scene.add(lineSegs)

    // Resize
    const observer = new ResizeObserver(() => {
      if (!container) return
      camera.aspect = container.clientWidth / container.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(container.clientWidth, container.clientHeight)
    })
    observer.observe(container)

    // Animation loop
    let frameId: number
    let t = 0

    const p = new THREE.Vector3()
    const q = new THREE.Vector3()

    function animate() {
      frameId = requestAnimationFrame(animate)
      t += 0.008

      // Update particle positions
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ix = i * 3
        positions[ix]     += velocities[i].x + Math.sin(t + phases[i]) * 0.012
        positions[ix + 1] += velocities[i].y + Math.cos(t * 0.7 + phases[i]) * 0.012
        positions[ix + 2] += velocities[i].z

        // Bounce off bounds
        if (Math.abs(positions[ix])     > BOUNDS) velocities[i].x *= -1
        if (Math.abs(positions[ix + 1]) > BOUNDS) velocities[i].y *= -1
        if (Math.abs(positions[ix + 2]) > BOUNDS * 0.5) velocities[i].z *= -1
      }
      particleGeo.attributes.position.needsUpdate = true

      // Build line segments between nearby particles
      let lineIdx = 0
      for (let i = 0; i < PARTICLE_COUNT && lineIdx < MAX_LINES - 1; i++) {
        p.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
        for (let j = i + 1; j < PARTICLE_COUNT && lineIdx < MAX_LINES - 1; j++) {
          q.set(positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2])
          const dist = p.distanceTo(q)
          if (dist < CONNECTION_DISTANCE) {
            const alpha = 1 - dist / CONNECTION_DISTANCE
            const li = lineIdx * 6
            linePositions[li]     = p.x; linePositions[li + 1] = p.y; linePositions[li + 2] = p.z
            linePositions[li + 3] = q.x; linePositions[li + 4] = q.y; linePositions[li + 5] = q.z
            // indigo → violet gradient along connection strength
            lineColors[li]     = 0.38 * alpha; lineColors[li + 1] = 0.40 * alpha; lineColors[li + 2] = 0.97 * alpha
            lineColors[li + 3] = 0.63 * alpha; lineColors[li + 4] = 0.45 * alpha; lineColors[li + 5] = 0.99 * alpha
            lineIdx++
          }
        }
      }
      lineGeo.setDrawRange(0, lineIdx * 2)
      lineGeo.attributes.position.needsUpdate = true
      lineGeo.attributes.color.needsUpdate = true

      // Slowly orbit camera
      camera.position.x = Math.sin(t * 0.15) * 120
      camera.position.z = Math.cos(t * 0.15) * 120
      camera.lookAt(scene.position)

      renderer.render(scene, camera)
    }

    animate()

    return () => {
      cancelAnimationFrame(frameId)
      observer.disconnect()
      renderer.dispose()
      container.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className="w-full h-full flex flex-col items-center justify-end pb-8 relative bg-[#0a0a12]">
      <div ref={mountRef} className="absolute inset-0" />
      <p className="relative z-10 text-indigo-300/70 text-sm font-mono tracking-widest uppercase animate-pulse">
        Generating pages…
      </p>
    </div>
  )
}
