import './style.css'

if (!navigator.gpu) {
  throw new Error('WebGPU is not supported in your browser')
}

const adapter = await navigator.gpu.requestAdapter()

if (!adapter) {
  throw new Error('WebGPU adapter not founded')
}

const device = await adapter.requestDevice()


// Setup canvas
const deviceRatio = window.devicePixelRatio || 1
const canvas = document.getElementById('canvas')
canvas.width = window.innerWidth * deviceRatio
canvas.height = window.innerHeight * deviceRatio
const preferedFormat = navigator.gpu.getPreferredCanvasFormat()
const context = canvas.getContext('webgpu')
context.configure({
  device: device,
  format: preferedFormat
})


// Create encoder to send passes to the GPU
const encoder = device.createCommandEncoder()


// Vertices

const vertices = new Float32Array([
  -0.5, -0.5,
   0.5, -0.5,
   0.5, 0.5,

  -0.5,  -0.5,
   0.5,  0.5,
  -0.5,  0.5
])

const vertexBuffer = device.createBuffer({
  label: 'Cell Vertices', // Add a label is useful for error handling
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
})

device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices)

const vertexBufferLayout = {
  arrayStride: 8, // Number of bytes between each vertex : 2 * 4 bytes (float32) (1 float32 = 4 bytes)
  attributes: [{
    format: 'float32x2',
    offset: 0,
    shaderLocation: 0 // Position, see shader
  }]
}

// Config shaders

const cellShaderModule = device.createShaderModule({
  label: 'Cell shader',
  code: `
  @vertex
  fn vertexMain(@location(0) pos: vec2f) ->
    @builtin(position) vec4f {
    return vec4f(pos, 0, 1);
  }

  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4f(1, 0, 0, 1);
  }
  `
}) // Return GPUShaderModule object compiled code


// Create render pipeline

const cellRenderPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto",
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: preferedFormat
    }]
  }
})


const pass = encoder.beginRenderPass({
  colorAttachments: [{
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    clearValue: [0.1, 0.1, 0.1, 1.0],
    storeOp: 'store' 
  }]
})



pass.setPipeline(cellRenderPipeline)
pass.setVertexBuffer(0, vertexBuffer)
pass.draw(vertices.length / 2)

pass.end()

// Create buffers
const commandBuffer = encoder.finish()

device.queue.submit([commandBuffer])