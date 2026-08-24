(() => {
  'use strict';

  const container = document.getElementById('canvas-container');
  const loading = document.getElementById('bg-loading');
  if (!container) return;

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.replaceChildren(canvas);

  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance'
  });

  if (!gl) {
    if (loading) loading.textContent = 'WEBGL 2 IS REQUIRED FOR THE ANIMATED BACKGROUND';
    return;
  }

  const vertexShaderSource = `#version 300 es
    in vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const moltenFragmentSource = `#version 300 es
    precision highp float;
    uniform vec2 iResolution;
    uniform float iTime;
    uniform float uSpeed;
    uniform float uScale;
    uniform float uDetail;
    uniform float uGlow;
    uniform float uCoreSize;
    uniform float uSwirl;
    uniform float uFold;
    uniform float uBlackPoint;
    uniform float uBrightness;
    uniform float uColorMode;
    uniform float uGrain;
    uniform float uGrainIntensity;
    uniform float uOpacity;
    uniform vec2 uMouse;
    uniform float uMouseStrength;
    uniform float uEnableMouse;
    uniform vec3 uColor1;
    uniform vec3 uColor2;
    uniform vec3 uColor3;
    out vec4 fragColor;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      float time = iTime * uSpeed;
      vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;

      vec2 drift = vec2(0.0);
      if (uEnableMouse > 0.5) {
        drift = (uMouse - 0.5) * uMouseStrength * 2.0;
      }
      p += drift;

      vec2 i = p;
      float c = 0.0;
      float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
      float d = length(p);
      float rot = d + time + p.x * uSwirl;

      float cosRot = cos(rot);
      mat2 warp = mat2(
        cos(rot - sin(time / 5.0)), sin(rot),
        -sin(cosRot - time), cosRot
      ) * uFold;
      float glowCore = uGlow * uCoreSize;

      for (float n = 0.0; n < 8.0; n++) {
        if (n >= uDetail) break;
        p *= warp;
        float t = r - time / (n + 3.0);
        i -= p + vec2(
          cos(t - i.x - r) + sin(t + i.y),
          sin(t - i.y) + cos(t + i.x) + r
        );
        c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
      }

      c /= 6.0;
      float intensity = max(c - uBlackPoint, 0.0) * uBrightness;
      float g = clamp(intensity, 0.0, 1.0);

      float mid = 0.5;
      if (uColorMode > 1.5) mid = 0.65;
      else if (uColorMode > 0.5) mid = 0.35;

      vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
      col = mix(col, uColor3, smoothstep(mid, 1.0, g));

      float a = g;
      if (uGrain > 0.5) {
        float gr = hash(gl_FragCoord.xy + iTime);
        a += (gr - 0.5) * uGrainIntensity;
      }
      a = clamp(a, 0.0, 1.0) * uOpacity;
      fragColor = vec4(col * a, a);
    }
  `;

  const iridescenceFragmentSource = `#version 300 es
    precision highp float;
    uniform float uTime;
    uniform vec3 uColor;
    uniform vec3 uResolution;
    uniform vec2 uMouse;
    uniform float uAmplitude;
    uniform float uSpeed;
    out vec4 fragColor;

    void main() {
      float mr = min(uResolution.x, uResolution.y);
      vec2 uv = (gl_FragCoord.xy * 2.0 / mr) - (uResolution.xy / mr);
      uv += (uMouse - vec2(0.5)) * uAmplitude;

      float d = -uTime * 0.5 * uSpeed;
      float a = 0.0;
      for (float i = 0.0; i < 8.0; ++i) {
        a += cos(i - d - a * uv.x);
        d += sin(uv.y * i + a);
      }
      d += uTime * 0.5 * uSpeed;
      vec3 col = vec3(
        cos(uv * vec2(d, a)) * 0.6 + 0.4,
        cos(a + d) * 0.5 + 0.5
      );
      col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
      fragColor = vec4(col, 1.0);
    }
  `;

  function compileShader(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || 'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(fragmentSource) {
    const program = gl.createProgram();
    const vertex = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
    const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || 'Unknown program error';
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  let moltenProgram;
  let iridescenceProgram;
  try {
    moltenProgram = createProgram(moltenFragmentSource);
    iridescenceProgram = createProgram(iridescenceFragmentSource);
  } catch (error) {
    if (loading) loading.textContent = 'UNABLE TO INITIALIZE THE ANIMATED BACKGROUND';
    console.error(error);
    return;
  }

  const triangle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );

  const molten = {
    program: moltenProgram,
    position: gl.getAttribLocation(moltenProgram, 'position'),
    iResolution: gl.getUniformLocation(moltenProgram, 'iResolution'),
    iTime: gl.getUniformLocation(moltenProgram, 'iTime'),
    uSpeed: gl.getUniformLocation(moltenProgram, 'uSpeed'),
    uScale: gl.getUniformLocation(moltenProgram, 'uScale'),
    uDetail: gl.getUniformLocation(moltenProgram, 'uDetail'),
    uGlow: gl.getUniformLocation(moltenProgram, 'uGlow'),
    uCoreSize: gl.getUniformLocation(moltenProgram, 'uCoreSize'),
    uSwirl: gl.getUniformLocation(moltenProgram, 'uSwirl'),
    uFold: gl.getUniformLocation(moltenProgram, 'uFold'),
    uBlackPoint: gl.getUniformLocation(moltenProgram, 'uBlackPoint'),
    uBrightness: gl.getUniformLocation(moltenProgram, 'uBrightness'),
    uColorMode: gl.getUniformLocation(moltenProgram, 'uColorMode'),
    uGrain: gl.getUniformLocation(moltenProgram, 'uGrain'),
    uGrainIntensity: gl.getUniformLocation(moltenProgram, 'uGrainIntensity'),
    uOpacity: gl.getUniformLocation(moltenProgram, 'uOpacity'),
    uMouse: gl.getUniformLocation(moltenProgram, 'uMouse'),
    uMouseStrength: gl.getUniformLocation(moltenProgram, 'uMouseStrength'),
    uEnableMouse: gl.getUniformLocation(moltenProgram, 'uEnableMouse'),
    uColor1: gl.getUniformLocation(moltenProgram, 'uColor1'),
    uColor2: gl.getUniformLocation(moltenProgram, 'uColor2'),
    uColor3: gl.getUniformLocation(moltenProgram, 'uColor3')
  };

  const iridescence = {
    program: iridescenceProgram,
    position: gl.getAttribLocation(iridescenceProgram, 'position'),
    uTime: gl.getUniformLocation(iridescenceProgram, 'uTime'),
    uColor: gl.getUniformLocation(iridescenceProgram, 'uColor'),
    uResolution: gl.getUniformLocation(iridescenceProgram, 'uResolution'),
    uMouse: gl.getUniformLocation(iridescenceProgram, 'uMouse'),
    uAmplitude: gl.getUniformLocation(iridescenceProgram, 'uAmplitude'),
    uSpeed: gl.getUniformLocation(iridescenceProgram, 'uSpeed')
  };

  const darkSettings = {
    color1: [0x52 / 255, 0x27 / 255, 1],
    color2: [1, 0x9f / 255, 0xfc / 255],
    color3: [1, 1, 1],
    speed: 0.35,
    scale: 4,
    detail: 3,
    glow: 1.6,
    coreSize: 0.1,
    swirl: 1,
    fold: -0.2,
    blackPoint: 0.05,
    brightness: 1.3,
    colorMode: 0,
    grain: 1,
    grainIntensity: 0.05,
    opacity: 1,
    mouseStrength: 0.3,
    enableMouse: 1
  };

  const lightSettings = {
    color: [1, 1, 1],
    speed: 1,
    amplitude: 0.1,
    mouseReact: 1
  };

  const mouse = { targetX: 0.5, targetY: 0.5, x: 0.5, y: 0.5 };
  let activeTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  let frameHandle = 0;
  let pageVisible = !document.hidden;
  let inViewport = true;
  let startTime = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(container.clientWidth * dpr));
    const height = Math.max(1, Math.floor(container.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function setTheme(theme) {
    activeTheme = theme === 'light' ? 'light' : 'dark';
    startTime = performance.now();
    resize();
  }

  function draw(now) {
    frameHandle = 0;
    if (!pageVisible || !inViewport) return;

    frameHandle = requestAnimationFrame(draw);
    resize();
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    gl.bindBuffer(gl.ARRAY_BUFFER, triangle);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const elapsed = (now - startTime) * 0.001;
    if (activeTheme === 'light') {
      gl.useProgram(iridescence.program);
      gl.enableVertexAttribArray(iridescence.position);
      gl.vertexAttribPointer(iridescence.position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(iridescence.uTime, elapsed);
      gl.uniform3fv(iridescence.uColor, lightSettings.color);
      gl.uniform3f(iridescence.uResolution, canvas.width, canvas.height, canvas.width / canvas.height);
      gl.uniform2f(iridescence.uMouse, mouse.x, mouse.y);
      gl.uniform1f(iridescence.uAmplitude, lightSettings.amplitude);
      gl.uniform1f(iridescence.uSpeed, lightSettings.speed);
    } else {
      gl.useProgram(molten.program);
      gl.enableVertexAttribArray(molten.position);
      gl.vertexAttribPointer(molten.position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(molten.iResolution, canvas.width, canvas.height);
      gl.uniform1f(molten.iTime, elapsed);
      gl.uniform1f(molten.uSpeed, darkSettings.speed);
      gl.uniform1f(molten.uScale, darkSettings.scale);
      gl.uniform1f(molten.uDetail, darkSettings.detail);
      gl.uniform1f(molten.uGlow, darkSettings.glow);
      gl.uniform1f(molten.uCoreSize, Math.max(darkSettings.coreSize, 0.001));
      gl.uniform1f(molten.uSwirl, darkSettings.swirl);
      gl.uniform1f(molten.uFold, darkSettings.fold);
      gl.uniform1f(molten.uBlackPoint, darkSettings.blackPoint);
      gl.uniform1f(molten.uBrightness, darkSettings.brightness);
      gl.uniform1f(molten.uColorMode, darkSettings.colorMode);
      gl.uniform1f(molten.uGrain, darkSettings.grain);
      gl.uniform1f(molten.uGrainIntensity, darkSettings.grainIntensity);
      gl.uniform1f(molten.uOpacity, darkSettings.opacity);
      gl.uniform2f(molten.uMouse, mouse.x, mouse.y);
      gl.uniform1f(molten.uMouseStrength, darkSettings.mouseStrength);
      gl.uniform1f(molten.uEnableMouse, darkSettings.enableMouse);
      gl.uniform3fv(molten.uColor1, darkSettings.color1);
      gl.uniform3fv(molten.uColor2, darkSettings.color2);
      gl.uniform3fv(molten.uColor3, darkSettings.color3);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function start() {
    if (!frameHandle && pageVisible && inViewport) frameHandle = requestAnimationFrame(draw);
  }

  function updateMouse(event) {
    // The About card owns pointer movement while the cursor is over it.
    if (event.target instanceof Element && event.target.closest('.about-card')) return;
    mouse.targetX = Math.min(1, Math.max(0, event.clientX / Math.max(window.innerWidth, 1)));
    mouse.targetY = Math.min(1, Math.max(0, 1 - event.clientY / Math.max(window.innerHeight, 1)));
    start();
  }

  window.addEventListener('resize', resize, { passive: true });
  document.addEventListener('mousemove', updateMouse, { passive: true });
  document.addEventListener('visibilitychange', () => {
    pageVisible = !document.hidden;
    if (pageVisible) start();
  });

  const observer = new MutationObserver(() => {
    setTheme(document.documentElement.getAttribute('data-theme'));
    start();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(container);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      if (inViewport) start();
    }).observe(container);
  }

  if (loading) loading.style.opacity = '0';
  resize();
  start();
})();
