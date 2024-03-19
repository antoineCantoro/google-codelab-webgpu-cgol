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

const GRID_SIZE = 32;

// Create encoder to send passes to the GPU
const encoder = device.createCommandEncoder()


// Vertices

const vertices = new Float32Array([
  -0.8, -0.8,
   0.8, -0.8,
   0.8, 0.8,

  -0.8,  -0.8,
   0.8,  0.8,
  -0.8,  0.8
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

// Uniform buffer
const uniformsArray = new Float32Array([GRID_SIZE, GRID_SIZE])
const uniformsBuffer = device.createBuffer({
  label: 'Uniform buffer',
  size: uniformsArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
})

device.queue.writeBuffer(uniformsBuffer, 0, uniformsArray)

// Config shaders

const cellShaderModule = device.createShaderModule({
  label: 'Cell shader',
  code: `
    struct VertexInput {
      @location(0) pos: vec2f,
      @builtin(instance_index) instance: u32
    };
    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) cell: vec2f
    };

    struct FragmentInput {
      @location(0) cell: vec2f,
    };

    @group(0) @binding(0) var<uniform> grid: vec2f;
    
    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
          // WGSL "let" is like const in JS, WGSL's "var" is more like JS' "let"
          let i = f32(input.instance);
          let cell = vec2f(i % grid.x, floor(i / grid.x));
          let cellOffset = cell / grid * 2;
          let gridPos = ((input.pos + 1) / grid) - 1 + cellOffset;

          var output : VertexOutput;
          output.pos = vec4f(gridPos, 0, 1);
          output.cell = cell;
          return output;
    }

    @fragment
    fn fragmentMain(input: FragmentInput) -> @location(0) vec4f {
      let c = input.cell / grid;
      return vec4f(c, 1.0 - c.x, 1.0);
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


const bindGroup = device.createBindGroup({
  label: 'Cell render pipe group',
  layout: cellRenderPipeline.getBindGroupLayout(0),
  entries: [{
    binding: 0,
    resource: {
      buffer: uniformsBuffer
    }
  }]
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

pass.setBindGroup(0, bindGroup)

pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE)

pass.end()

// Create buffers
const commandBuffer = encoder.finish()

device.queue.submit([commandBuffer])