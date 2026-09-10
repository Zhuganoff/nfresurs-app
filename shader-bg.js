/* Живой волновой фон «Отходы в доходы» — один WebGL-canvas, без зависимостей.
   Перенос шейдера «Waves» (21st.dev Shader Builder) в чистый JS: React был
   нужен там только обёрткой. Палитра — цвета бренда (задаётся в opts).

   Использование:
     var h = mountShaderBackground(canvas, { colors: [...], pixelCap: 1e6 });
     if (!h) { // WebGL нет — оставить CSS-фолбэк }
     h.dispose();  // остановить и освободить контекст

   Синтаксис намеренно ES5 (var/function, без ?. и стрелок): файл общий для
   лендинга и Telegram WebView, где старый движок валит весь файл на новом
   синтаксисе. Остановка отрисовки: скрытая вкладка, canvas вне вьюпорта,
   prefers-reduced-motion (один кадр). */
(function (global) {
  'use strict';

  var VERT = 'attribute vec2 a_position;\n' +
    'void main(){ gl_Position = vec4(a_position, 0.0, 1.0); }';

  var FRAG = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'uniform vec3 u_colors[8];',
    'uniform vec4 u_scene;',     // resolution.xy, time, colour count
    'uniform vec4 u_shape;',     // scale, intensity, paramA, warp
    'uniform vec4 u_surface;',   // detail, contrast, brightness, saturation
    'uniform vec4 u_finish;',    // hue, vignette, blur, grain
    'uniform vec4 u_transform;', // seed, rotation, drift, oklab
    'uniform vec4 u_space;',     // offset.xy, pointer.xy
    '#define u_resolution u_scene.xy',
    '#define u_time u_scene.z',
    '#define u_colorCount u_scene.w',
    '#define u_scale u_shape.x',
    '#define u_intensity u_shape.y',
    '#define u_warp u_shape.w',
    '#define u_detail u_surface.x',
    '#define u_contrast u_surface.y',
    '#define u_brightness u_surface.z',
    '#define u_saturation u_surface.w',
    '#define u_vignette u_finish.y',
    '#define u_grain u_finish.w',
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    '#define u_seed u_transform.x',
    '#else',
    '#define u_seed mod(u_transform.x, 31.0)',
    '#endif',
    '#define u_rotate u_transform.y',
    '#define u_drift u_transform.z',
    '#define u_oklab u_transform.w',
    '#define u_offset u_space.xy',
    'float hash21(vec2 p){',
    '#ifndef GL_FRAGMENT_PRECISION_HIGH',
    '  p = mod(p, 31.0);',
    '#endif',
    '  p = fract(p * vec2(234.34, 435.345));',
    '  p += dot(p, p + 34.23);',
    '  return fract(p.x * p.y);',
    '}',
    'float grainHash(vec2 p){',
    '  vec3 p3 = fract(vec3(p.xyx) * 0.1031);',
    '  p3 += dot(p3, p3.yzx + 33.33);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'float noise(vec2 p){',
    '  vec2 i = floor(p); vec2 f = fract(p);',
    '  vec2 u = f * f * (3.0 - 2.0 * f);',
    '  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),',
    '             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);',
    '}',
    'float fbm(vec2 p){',
    '  float v = 0.0; float a = 0.5;',
    '  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.0, 9.2); a *= 0.5; }',
    '  return v;',
    '}',
    'vec3 srgbToLinear(vec3 c){ return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }',
    'vec3 linearToSrgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
    'vec3 linToOklab(vec3 c){',
    '  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;',
    '  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;',
    '  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;',
    '  l = pow(max(l, 0.0), 1.0 / 3.0); m = pow(max(m, 0.0), 1.0 / 3.0); s = pow(max(s, 0.0), 1.0 / 3.0);',
    '  return vec3(0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,',
    '              1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,',
    '              0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);',
    '}',
    'vec3 oklabToLin(vec3 c){',
    '  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;',
    '  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;',
    '  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;',
    '  l = l * l * l; m = m * m * m; s = s * s * s;',
    '  return vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,',
    '              -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,',
    '              -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);',
    '}',
    'vec3 mixColour(vec3 a, vec3 b, float t){',
    '  if (u_oklab > 0.5) {',
    '    vec3 la = linToOklab(srgbToLinear(a)); vec3 lb = linToOklab(srgbToLinear(b));',
    '    return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);',
    '  }',
    '  return mix(a, b, t);',
    '}',
    'vec3 palette(float x){',
    '  float n = max(u_colorCount - 1.0, 1.0);',
    '  float f = clamp(x, 0.0, 1.0) * n;',
    '  vec3 col = u_colors[0];',
    '  for (int i = 0; i < 7; i++) {',
    '    if (float(i) < n) col = mixColour(col, u_colors[i + 1], smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));',
    '  }',
    '  return col;',
    '}',
    'vec3 shade(vec2 uv, vec2 p, float t){',
    '  float y = uv.y',
    '    + sin(uv.x * (3.0 + u_intensity * 9.0) + t * 0.8) * 0.08',
    '    + (fbm(p * 2.0 + t * 0.1) - 0.5) * u_intensity * 0.6;',
    '  return palette(y);',
    '}',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / u_resolution.xy;',
    '  vec2 screenUv = uv;',
    '  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);',
    '  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;',
    '  p *= u_scale;',
    '  if (abs(u_rotate) > 0.0001) { float cr = cos(u_rotate), sr = sin(u_rotate); p = mat2(cr, -sr, sr, cr) * p; }',
    '  p += u_offset;',
    '  if (u_drift > 0.0001) p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));',
    '  if (u_warp > 0.0) p += u_warp * (vec2(fbm(p * u_detail + u_seed), fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);',
    '  vec3 col = shade(uv, p, u_time);',
    '  if (abs(u_contrast - 1.0) > 0.0001) col = (col - 0.5) * u_contrast + 0.5;',
    '  if (abs(u_saturation - 1.0) > 0.0001) { float luma = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(luma), col, u_saturation); }',
    '  if (abs(u_brightness) > 0.0001) col += u_brightness;',
    '  if (u_vignette > 0.0001) { float vd = length(screenUv - 0.5) * 1.41421356; col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd); }',
    '  if (u_grain > 0.0001) col += (grainHash(gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;',
    '  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);',
    '}'
  ].join('\n');

  // Палитра бренда снизу вверх: тёмно-зелёный → глубокий зелёный → мята → золото.
  var BRAND = ['#070d0b', '#255d51', '#7fd0b4', '#d9a04a'];

  var DEFAULTS = {
    colors: BRAND,
    scale: 1.5, intensity: 0.55, warp: 0.0,
    detail: 2.4, contrast: 1.005, brightness: 0.0, saturation: 1.0,
    vignette: 0.0, grain: 0.042,
    seed: 1.0, rotate: 0.0, drift: 0.0, oklab: 0.0,
    offsetX: 0.0, offsetY: 0.0,
    timeScale: 0.86,
    pixelCap: 2000000, // максимум пикселей canvas (2 Мпикс — как в оригинале)
    maxDpr: 2
  };

  function hexToRgb(h) {
    if (typeof h !== 'string') return h; // уже [r,g,b] 0..1
    var s = h.replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  function merge(a, b) {
    var o = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) o[k] = a[k];
    if (b) for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) o[k] = b[k];
    return o;
  }

  function mountShaderBackground(canvas, opts) {
    if (!canvas || !global.WebGLRenderingContext) return null;
    var cfg = merge(DEFAULTS, opts);
    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }) ||
           canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
    } catch (e) { gl = null; }
    if (!gl) return null;

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        try { if (global.console) console.warn('shader-bg:', gl.getShaderInfoLog(s)); } catch (e) {}
        gl.deleteShader(s);
        return null;
      }
      return s;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); return null; }
    gl.useProgram(program);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var U = function (n) { return gl.getUniformLocation(program, n); };
    var uScene = U('u_scene'), uSpace = U('u_space');

    // 8 слотов цветов: недостающие заполняем последним цветом палитры.
    var cols = [], i;
    var src = cfg.colors && cfg.colors.length ? cfg.colors : BRAND;
    for (i = 0; i < 8; i++) cols.push(hexToRgb(src[Math.min(i, src.length - 1)]));
    var flat = [];
    for (i = 0; i < 8; i++) flat.push(cols[i][0], cols[i][1], cols[i][2]);
    gl.uniform3fv(U('u_colors'), new Float32Array(flat));
    gl.uniform4f(U('u_shape'), cfg.scale, cfg.intensity, 0.5, cfg.warp);
    gl.uniform4f(U('u_surface'), cfg.detail, cfg.contrast, cfg.brightness, cfg.saturation);
    gl.uniform4f(U('u_finish'), 0.0, cfg.vignette, 0.0, cfg.grain);
    gl.uniform4f(U('u_transform'), cfg.seed, cfg.rotate, cfg.drift, cfg.oklab);
    gl.uniform4f(uSpace, cfg.offsetX, cfg.offsetY, 0.0, 0.0);

    var reduced = false;
    try { reduced = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) {}
    var animated = Math.abs(cfg.timeScale) > 0.0001 && !reduced;

    var raf = 0, disposed = false, inView = true;
    var visible = !global.document || global.document.visibilityState !== 'hidden';
    var start = (global.performance && performance.now) ? performance.now() : Date.now();
    var bounds = canvas.getBoundingClientRect();

    function resize() {
      var dpr = Math.min(global.devicePixelRatio || 1, cfg.maxDpr);
      var rw = Math.max(1, Math.round(bounds.width * dpr));
      var rh = Math.max(1, Math.round(bounds.height * dpr));
      var k = Math.min(1, Math.sqrt(cfg.pixelCap / Math.max(1, rw * rh)));
      var w = Math.max(1, Math.round(rw * k)), h = Math.max(1, Math.round(rh * k));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    }

    function render(now) {
      raf = 0;
      if (disposed || !visible || !inView) return;
      resize();
      gl.uniform4f(uScene, canvas.width, canvas.height, ((now - start) / 1000) * cfg.timeScale, src.length);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (animated) request();
    }
    function request() {
      if (!disposed && visible && inView && raf === 0) raf = global.requestAnimationFrame(render);
    }
    function layout() {
      bounds = canvas.getBoundingClientRect();
      resize();
      request();
    }
    function onVis() {
      visible = global.document.visibilityState !== 'hidden';
      if (visible) request();
      else if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
    }

    global.addEventListener('resize', layout);
    global.document.addEventListener('visibilitychange', onVis);
    var ro = null, io = null;
    if (global.ResizeObserver) { ro = new ResizeObserver(layout); ro.observe(canvas); }
    if (global.IntersectionObserver) {
      io = new IntersectionObserver(function (entries) {
        var e = entries[0];
        inView = e ? e.isIntersecting : true;
        if (inView) request();
        else if (raf) { global.cancelAnimationFrame(raf); raf = 0; }
      });
      io.observe(canvas);
    }
    // Первый кадр сразу (без ожидания rAF) — чтобы фолбэк не мигал.
    render(start);

    return {
      dispose: function () {
        if (disposed) return;
        disposed = true;
        if (raf) global.cancelAnimationFrame(raf);
        raf = 0;
        global.removeEventListener('resize', layout);
        global.document.removeEventListener('visibilitychange', onVis);
        if (ro) ro.disconnect();
        if (io) io.disconnect();
        try { gl.deleteBuffer(buf); gl.deleteProgram(program); } catch (e) {}
        try {
          var ext = gl.getExtension('WEBGL_lose_context');
          if (ext) ext.loseContext();
        } catch (e2) {}
        canvas.width = 1; canvas.height = 1;
      }
    };
  }

  mountShaderBackground.BRAND = BRAND;
  mountShaderBackground.FRAG = FRAG;
  mountShaderBackground.VERT = VERT;
  global.mountShaderBackground = mountShaderBackground;
})(window);
