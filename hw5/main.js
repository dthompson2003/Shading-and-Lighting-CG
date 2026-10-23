const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;
out vec3 vNormal;

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  // The current meshes use face normals (cube) or smoothly varying normals (sphere/cylinder).
  vNormal = mat3(uModelView) * aNormal;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec3 vPosition;
in vec3 vNormal;

uniform vec3 uLightPos0;
uniform vec3 uLightPos1;
uniform vec3 uLightColor0;
uniform vec3 uLightColor1;
uniform vec3 uColor;
uniform float uSpecularStrength;
uniform float uShininess;

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPosition);

  vec3 ambient = 0.12 * uColor;
  vec3 result = ambient;

  vec3 L0 = normalize(uLightPos0 - vPosition);
  float diff0 = max(dot(N, L0), 0.0);
  vec3 R0 = reflect(-L0, N);
  float spec0 = diff0 > 0.0
      ? pow(max(dot(V, R0), 0.0), max(uShininess, 1.0))
      : 0.0;
  result += uLightColor0 * (0.65 * uColor * diff0
             + uSpecularStrength * vec3(spec0));

  vec3 L1 = normalize(uLightPos1 - vPosition);
  float diff1 = max(dot(N, L1), 0.0);
  vec3 R1 = reflect(-L1, N);
  float spec1 = diff1 > 0.0
      ? pow(max(dot(V, R1), 0.0), max(uShininess, 1.0))
      : 0.0;
  result += uLightColor1 * (0.65 * uColor * diff1
             + uSpecularStrength * vec3(spec1));

  fragColor = vec4(result, 1.0);
}
`;

// WebGL setup
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

// Fixed attribute slots, so the meshes stay valid when the shaders are recompiled
const ATTRIBUTES = { aPosition: 0, aNormal: 1 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

// Shader editors
const vertEditor = document.getElementById("vertEditor");
const fragEditor = document.getElementById("fragEditor");
const shaderError = document.getElementById("shaderError");
vertEditor.value = VERTEX_SHADER;
fragEditor.value = FRAGMENT_SHADER;

let program, uModelView, uProjection, uLightPos0, uLightPos1, uLightColor0, uLightColor1, uColor, uSpecularStrength, uShininess;

function updateProgram() {
  try {
    const prog = createProgram(vertEditor.value, fragEditor.value);
    gl.deleteProgram(program);
    program = prog;
    gl.useProgram(program);
    uModelView = gl.getUniformLocation(program, "uModelView");
    uProjection = gl.getUniformLocation(program, "uProjection");
    uLightPos0 = gl.getUniformLocation(program, "uLightPos0");
    uLightPos1 = gl.getUniformLocation(program, "uLightPos1");
    uLightColor0 = gl.getUniformLocation(program, "uLightColor0");
    uLightColor1 = gl.getUniformLocation(program, "uLightColor1");
    uColor = gl.getUniformLocation(program, "uColor");
    uSpecularStrength = gl.getUniformLocation(program, "uSpecularStrength");
    uShininess = gl.getUniformLocation(program, "uShininess");
    shaderError.textContent = "";
  } catch (e) {
    shaderError.textContent = e.message.replace(/\0/g, "");  // some drivers end the log with \0
  }
}
updateProgram();
vertEditor.addEventListener("input", updateProgram);
fragEditor.addEventListener("input", updateProgram);

function bindAttribute(name, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions);
  bindAttribute("aNormal", normals);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

const cubeMesh = createMesh(createCube());
const cylinderMesh = createMesh(createCylinder(32));
const shpereMesh = createMesh(createSphere(32));

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0, 0, 0, 1);
const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);
const lightWorld = [3, 4, 5];       // Light 1: warm key light
const lightWorld2 = [-3, 2, 2];     // Light 2: cool fill light
let light2Intensity = 0.7;

// nteractive controls
let dragRotX = 0, dragRotY = -0.5;      // mouse drag
let camX = 0, camY = 0, camZ = -7;      // arrow keys, w, s
let sliderAngle = 0;                    // degrees
let spinning = false, spinAngle = 0;    // Start/Stop button

let mouseDown = false, lastX, lastY;
canvas.addEventListener("mousedown", e => { mouseDown = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => mouseDown = false);
window.addEventListener("mousemove", e => {
  if (!mouseDown) return;
  dragRotY += (e.clientX - lastX) * 0.01;
  dragRotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
});

document.addEventListener("keydown", e => {
  if (e.target === vertEditor || e.target === fragEditor) return;  // let the editors use the keys
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": camY -= step; break;
    case "ArrowDown": camY += step; break;
    case "ArrowLeft": camX += step; break;
    case "ArrowRight": camX -= step; break;
    case "w": camZ += step; break;
    case "s": camZ -= step; break;
    default: return;
  }
  e.preventDefault();  // keep the arrow keys from scrolling the page
});

const axisSelect = document.getElementById("axisSelect");
document.getElementById("slider").addEventListener("input", e => {
  sliderAngle = Number(e.target.value);
  document.getElementById("sliderValue").textContent = sliderAngle;
});
document.getElementById("spinButton").addEventListener("click", () => spinning = !spinning);


function createNode(mesh, color, shape) {
  return {
    mesh, color, shape,
    joint: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
    children: [],
    material: { specularStrength: 0.35, shininess: 32 }
  };
}

// Material presets. Geometry normals determine the shading style:
// the cube has flat face normals; the sphere has smooth vertex normals.
function metalMaterials(node) {
  node.material.specularStrength = 0.95;
  node.material.shininess = 96;
}

function woodMaterial(node) {
  node.material.specularStrength = 0.12;
  node.material.shininess = 12;
}

function flatShader(node) {
  // The cube mesh already duplicates vertices and normals per face.
  node.material.shininess = Math.max(1, node.material.shininess);
}

function smoothShader(node) {
  // Use with sphere/cylinder meshes, whose normals vary smoothly over vertices.
  node.material.shininess = Math.max(1, node.material.shininess);
}


// Extra HW5 controls: independent joint angles and per-object materials.
let upperArmUserAngle = 0;
let handUserAngle = 0;

function hexToRgb01(hex) {
  const value = hex.replace("#", "");
  return [
    parseInt(value.slice(0, 2), 16) / 255,
    parseInt(value.slice(2, 4), 16) / 255,
    parseInt(value.slice(4, 6), 16) / 255
  ];
}

// Lower arm: scale the cylinder then move it up by 0.6 so its bottom sits at the joint
const lowerArm = createNode(cylinderMesh, [1, 0.2, 0.2],
  multiply(translate(0, 0.6, 0), scale(0.3, 0.6, 0.3)));
woodMaterial(lowerArm);
flatShader(lowerArm);

// Upper arm: scale the cube then move it up by 0.5 so its bottom sits at the joint
const upperArm = createNode(cubeMesh, [0.2, 0.4, 1],
  multiply(translate(0, 0.5, 0), scale(0.2, 0.5, 0.2)));
woodMaterial(upperArm);
flatShader(upperArm);

const hand = createNode(shpereMesh, [0, 1, 0],
  multiply(translate(0, 0.4, 0), scale(0.4, 0.4, 0.4)));
metalMaterials(hand);
smoothShader(hand);

const lFinger1 = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.3, 0), scale(0.1, 0.3, 0.1)));
const lFinger2 = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.3, 0), scale(0.1, 0.3, 0.1)));
const lFinger3 = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.3, 0), scale(0.1, 0.3, 0.1)));


const uFinger3 = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.2, 0), scale(0.1, 0.2, 0.1)));
const uFinger2 = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.2, 0), scale(0.1, 0.2, 0.1)));
const uFinger1 = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.2, 0), scale(0.1, 0.2, 0.1)));

const lThumb = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.2, 0), multiply(rotateX(90), scale(0.1, 0.2, 0.1))));
const uThumb = createNode(cylinderMesh, [0, 1, 0], multiply(translate(0, 0.2, 0), multiply(rotateX(180), scale(0.1, 0.2, 0.1))));
lThumb.children.push(uThumb);
lFinger1.children.push(uFinger1);
lFinger2.children.push(uFinger2);
lFinger3.children.push(uFinger3);
hand.children.push(lThumb);
hand.children.push(lFinger3);
hand.children.push(lFinger2);
hand.children.push(lFinger1); 
upperArm.children.push(hand);
lowerArm.children.push(upperArm);



// Wire up the new UI controls after the scene nodes have been created.
document.getElementById("upperArmAngle").addEventListener("input", e => {
  upperArmUserAngle = Number(e.target.value) * Math.PI / 180;
  document.getElementById("upperArmAngleValue").textContent = e.target.value + "°";
});
document.getElementById("handAngle").addEventListener("input", e => {
  handUserAngle = Number(e.target.value) * Math.PI / 180;
  document.getElementById("handAngleValue").textContent = e.target.value + "°";
});

function connectMaterialControls(prefix, node) {
  document.getElementById(prefix + "Color").addEventListener("input", e => {
    node.color = hexToRgb01(e.target.value);
  });
  document.getElementById(prefix + "Specular").addEventListener("input", e => {
    node.material.specularStrength = Number(e.target.value) / 100;
    document.getElementById(prefix + "SpecularValue").textContent = e.target.value + "%";
  });
  document.getElementById(prefix + "Shininess").addEventListener("input", e => {
    node.material.shininess = Number(e.target.value);
    document.getElementById(prefix + "ShininessValue").textContent = e.target.value;
  });
}
connectMaterialControls("upperArm", upperArm);
connectMaterialControls("hand", hand);

document.getElementById("light2Intensity").addEventListener("input", e => {
  light2Intensity = Number(e.target.value) / 100;
  document.getElementById("light2IntensityValue").textContent = e.target.value + "%";
});

function drawNode(node, frame) {
  gl.uniformMatrix4fv(uModelView, false, multiply(frame, node.shape));
  gl.uniform3fv(uColor, node.color);
  gl.uniform1f(uSpecularStrength, node.material.specularStrength);
  gl.uniform1f(uShininess, node.material.shininess);
  gl.bindVertexArray(node.mesh.vao);
  gl.drawElements(gl.TRIANGLES, node.mesh.count, gl.UNSIGNED_SHORT, 0);
}

//Data structure
function drawTree(root, rootFrame) {
  const stack = [[root, rootFrame]];
  while (stack.length > 0) {
    const [node, parentFrame] = stack.pop();
    const frame = multiply(parentFrame, node.joint);
    drawNode(node, frame);
    for (const child of node.children) stack.push([child, frame]);
  }
}

// Render loop
let lastTime = 0;
function render(time) {
  const t = time / 1000;
  if (spinning) spinAngle += t - lastTime;
  lastTime = t;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Camera moves with the keys; the light stays fixed in the world.
  const view = translate(camX, camY, camZ);
  gl.uniformMatrix4fv(uProjection, false, projection);
  gl.uniform3fv(uLightPos0, transformPoint(view, lightWorld));
  gl.uniform3fv(uLightPos1, transformPoint(view, lightWorld2));
  gl.uniform3fv(uLightColor0, [1.0, 0.88, 0.72]);
  gl.uniform3fv(uLightColor1, [0.55 * light2Intensity, 0.72 * light2Intensity, 1.0 * light2Intensity]);


  // Whole-model rotation
  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  const rotation = multiply(multiply(rotateY(dragRotY), rotateX(dragRotX)), axisRotation);

  // Lower arm (root)
  lowerArm.joint = multiply(multiply(translate(0, -2, 0), rotation), rotateZ(0.5 * Math.sin(t)));

  // Upper arm (child)
  upperArm.joint = multiply(
    translate(0, 1.2, 0),
    rotateZ(Math.sin(1.5 * t) + 1 + upperArmUserAngle)
  );

  hand.joint = multiply(translate(0, 1.1, 0), rotateZ(handUserAngle));

  let fingery = 0.5
  let ufingery = .6
  lFinger1.joint = multiply(translate(0.3, fingery, 0), rotateX(Math.sin(1.5 * t) + 1));  // Left finger
  lFinger2.joint = multiply(translate(0.0, fingery, 0), rotateX(Math.sin(1.5 * t) + 1));  // Middle finger
  lFinger3.joint = multiply(translate(-0.3, fingery, 0), rotateX(Math.sin(1.5 * t) + 1)); // Right finger
  lThumb.joint = translate(-0.4, 0, 0);
  uThumb.joint = multiply(translate(0, 0, 0.3), rotateY(Math.sin(1.5 * t) + 1));
  uFinger1.joint = multiply(translate(0, ufingery, 0), rotateX(Math.sin(1.5 * t) + 1));
  uFinger2.joint = multiply(translate(0, ufingery, 0), rotateX(Math.sin(1.5 * t) + 1));
  uFinger3.joint = multiply(translate(0, ufingery, 0), rotateX(Math.sin(1.5 * t) + 1));


  
  drawTree(lowerArm, view);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
