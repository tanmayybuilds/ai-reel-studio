// Property tour engine: draws any frame of the reel from tour.json + media.json.
// The editor preview and the final render both call engine.renderAt(t), so what is approved is what renders.
// WebGL2 draws the pictures (camera keyframes, depth parallax, transitions, grade, grain);
// a DOM layer on top draws the text (labels, stats, title, outro card, room tracker).
(function () {
  'use strict';
  const W = 1080, H = 1920;

  // ---------- easing ----------
  const sine = t => -(Math.cos(Math.PI * t) - 1) / 2;
  const EASE = {
    linear: t => t,
    soft: t => 0.45 * t + 0.55 * sine(t), // never fully stops, so moves flow through transitions
    inOutSine: sine,
    inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutQuart: t => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2),
    outCubic: t => 1 - Math.pow(1 - t, 3),
    inCubic: t => t * t * t,
    outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    outBack: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (name, t) => (EASE[name] || EASE.soft)(clamp(t, 0, 1));
  const span = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a), 0, 1);

  const TRANSITIONS = {none: 0, cut: 0, fade: 2, whip: 3, zoom: 4, warp: 5, leak: 6, slide: 7, flash: 8, lens: 9, mirror: 10, spin: 11};
  const DIRS = {left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1]};

  // ---------- timeline (mirrored in scripts/tourlib.py) ----------
  function trDur(shot) {
    const tr = shot && shot.transition;
    if (!tr || !TRANSITIONS[tr.type]) return 0;
    return tr.dur != null ? tr.dur : 0.5;
  }
  function buildTimeline(tour) {
    const segs = [];
    let t = 0;
    tour.shots.forEach((shot, i) => { segs.push({i, shot, start: t, end: t + shot.dur}); t += shot.dur; });
    segs.forEach((g, i) => {
      g.tin = i > 0 ? trDur(segs[i - 1].shot) : 0;
      g.tout = i < segs.length - 1 ? trDur(g.shot) : 0;
      g.vStart = g.start - g.tin / 2;
      g.vEnd = g.end + g.tout / 2;
    });
    return {segs, duration: t};
  }

  // ---------- camera ----------
  function defaultKeys() { return [{u: 0, x: 0.5, y: 0.5, z: 1.06}, {u: 1, x: 0.5, y: 0.5, z: 1.16}]; }
  function camAt(shot, u) {
    const keys = (shot.keys && shot.keys.length ? shot.keys : defaultKeys()).slice().sort((a, b) => a.u - b.u);
    if (u <= keys[0].u) return Object.assign({r: 0}, keys[0]);
    const last = keys[keys.length - 1];
    if (u >= last.u) return Object.assign({r: 0}, last);
    let k = 0;
    while (k < keys.length - 2 && u > keys[k + 1].u) k++;
    const a = keys[k], b = keys[k + 1];
    const e = ease(b.ease || shot.ease || 'soft', (u - a.u) / Math.max(1e-6, b.u - a.u));
    return {x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, e), r: lerp(a.r || 0, b.r || 0, e)};
  }
  // Keep the view inside the picture: centre clamped so no edge shows.
  function viewSize(imgAsp, outAsp, z) {
    const s = imgAsp > outAsp ? [outAsp / imgAsp, 1] : [1, imgAsp / outAsp];
    return [s[0] / z, s[1] / z];
  }
  function clampCam(cam, imgAsp, outAsp) {
    const z = Math.max(1, cam.z);
    const [vw, vh] = viewSize(imgAsp, outAsp, z);
    return {x: clamp(cam.x, vw / 2, 1 - vw / 2), y: clamp(cam.y, vh / 2, 1 - vh / 2), z, r: cam.r || 0};
  }

  // ---------- shaders ----------
  const VS_PHOTO = `#version 300 es
  in vec2 aCorner;
  uniform vec2 uRes; uniform vec4 uRect; uniform float uAngle;
  out vec2 vLocal;
  void main(){
    vec2 c = uRect.xy + uRect.zw*0.5;
    vec2 p = (aCorner-0.5)*uRect.zw;
    float s=sin(uAngle), co=cos(uAngle);
    p = vec2(co*p.x - s*p.y, s*p.x + co*p.y);
    vec2 pos = c + p;
    vLocal = aCorner;
    gl_Position = vec4(pos.x/uRes.x*2.0-1.0, 1.0-pos.y/uRes.y*2.0, 0.0, 1.0);
  }`;
  const FS_PHOTO = `#version 300 es
  precision highp float;
  in vec2 vLocal;
  uniform sampler2D uImg; uniform sampler2D uDepth;
  uniform float uHasDepth, uPar, uLod, uRadius, uOpacity, uShadow;
  uniform vec2 uImgSize; uniform vec4 uRect;
  uniform vec4 uCam; uniform vec3 uCam0;
  uniform vec4 uGrade; uniform vec3 uTint;
  out vec4 o;
  vec2 viewSize(float ai, float ao, float z){ vec2 s = ai > ao ? vec2(ao/ai, 1.0) : vec2(1.0, ai/ao); return s/z; }
  vec3 sampleImg(vec2 uv){
    if (uLod <= 0.0) return texture(uImg, uv).rgb;
    vec3 c = vec3(0.0); float r = 0.012;
    for (int i=-1;i<=1;i++) for (int j=-1;j<=1;j++) c += textureLod(uImg, uv + vec2(float(i),float(j))*r, uLod).rgb;
    return c/9.0;
  }
  void main(){
    vec2 px = (vLocal-0.5)*uRect.zw;
    vec2 q = abs(px) - (uRect.zw*0.5 - uRadius);
    float d = length(max(q,0.0)) + min(max(q.x,q.y),0.0) - uRadius;
    if (uShadow > 0.0) { float a = uShadow*(1.0 - smoothstep(-uShadow*60.0, 50.0, d)); o = vec4(0.0,0.0,0.0,a*uOpacity); return; }
    float mask = clamp(0.5 - d, 0.0, 1.0);
    if (mask <= 0.0) discard;
    float ai = uImgSize.x/uImgSize.y, ao = uRect.z/uRect.w;
    vec2 vs = viewSize(ai, ao, uCam.z);
    vec2 l = (vLocal - 0.5) * vec2(ao, 1.0);
    float s = sin(uCam.w), c = cos(uCam.w);
    l = vec2(c*l.x - s*l.y, s*l.x + c*l.y) / vec2(ao, 1.0);
    vec2 base = uCam.xy + l*vs;
    vec2 uv = base;
    if (uHasDepth > 0.5 && uPar > 0.0) {
      float dz = uCam.z/uCam0.z - 1.0;
      vec2 pan = uCam.xy - uCam0.xy;
      for (int i=0;i<4;i++){
        float k = uPar*(texture(uDepth, uv).r - 0.5);
        uv = uCam.xy + (base - uCam.xy)/(1.0 + k*dz*1.6) + k*pan*0.9;
      }
    }
    vec3 col = sampleImg(uv);
    col *= uGrade.x;
    col = (col-0.5)*uGrade.y + 0.5;
    float lum = dot(col, vec3(0.2126,0.7152,0.0722));
    col = mix(vec3(lum), col, uGrade.z);
    col += vec3(0.025,0.008,-0.022)*uGrade.w;
    float a = mask*uOpacity;
    o = vec4(clamp(col,0.0,1.0)*a, a);
  }`;
  const VS_FULL = `#version 300 es
  in vec2 aCorner; void main(){ gl_Position = vec4(aCorner*2.0-1.0, 0.0, 1.0); }`;
  const FS_COMP = `#version 300 es
  precision highp float;
  uniform sampler2D uA; uniform sampler2D uB;
  uniform float uQ, uFrame, uGrain, uVig, uDarken; uniform int uType; uniform vec2 uDir; uniform vec3 uAccent; uniform vec2 uRes;
  out vec4 o;
  const float PI = 3.14159265;
  vec3 A(vec2 p){ return texture(uA, vec2(p.x, 1.0-p.y)).rgb; }
  vec3 B(vec2 p){ return texture(uB, vec2(p.x, 1.0-p.y)).rgb; }
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5; } return v; }
  vec2 mw(vec2 p){ return 1.0 - abs(1.0 - mod(p, 2.0)); }   // mirror-wrap: no empty edges when the picture spins or shifts
  vec2 rot2(vec2 v, float a){ float s = sin(a), c = cos(a); return vec2(c*v.x - s*v.y, s*v.x + c*v.y); }
  // lens zoom-through: rush into the centre with a fisheye bulge and radial blur (k 0..1)
  vec3 lensA(vec2 p, float k, float asp){
    vec3 acc = vec3(0.0);
    for (int i=0;i<16;i++){
      vec2 d = (p - 0.5)*vec2(asp, 1.0);
      float r = length(d);
      float f = (1.0 - k*0.22*float(i)/15.0) * (1.0 + 2.6*k*r*r) / (1.0 + 3.2*k);
      acc += A(mw(0.5 + d*f/vec2(asp, 1.0)));
    }
    return acc/16.0;
  }
  vec3 lensB(vec2 p, float k, float asp){
    vec3 acc = vec3(0.0);
    for (int i=0;i<16;i++){
      vec2 d = (p - 0.5)*vec2(asp, 1.0);
      float r = length(d);
      float f = (1.0 + k*0.22*float(i)/15.0) * (1.0 + 2.6*k*r*r) / (1.0 + 3.2*k);
      acc += B(mw(0.5 + d*f/vec2(asp, 1.0)));
    }
    return acc/16.0;
  }
  float easeIO(float t){ return t<0.5 ? 4.0*t*t*t : 1.0-pow(-2.0*t+2.0,3.0)/2.0; }
  vec3 strip(vec2 p, vec2 dir, float e){
    vec2 a = p - dir*e;
    float axis = abs(dir.x) > 0.5 ? a.x : a.y;
    if (axis >= 0.0 && axis <= 1.0) return A(clamp(a, 0.0, 1.0));
    return B(clamp(a + dir, 0.0, 1.0));
  }
  void main(){
    vec2 p = vec2(gl_FragCoord.x/uRes.x, 1.0 - gl_FragCoord.y/uRes.y);
    float q = clamp(uQ, 0.0, 1.0);
    vec3 col;
    if (uType == 0) {
      col = A(p);
    } else if (uType == 2) {
      col = mix(A(p), B(p), smoothstep(0.0, 1.0, q));
    } else if (uType == 3) {           // whip pan: one continuous strip, heavy directional blur at the peak
      float e = easeIO(q);
      float blur = pow(sin(PI*q), 0.9)*0.30;
      col = vec3(0.0);
      for (int i=0;i<28;i++){ float f = (float(i)/27.0 - 0.5)*blur; col += strip(p + uDir*f, uDir, e); }
      col /= 28.0;
    } else if (uType == 4) {           // zoom through: A rushes in, B settles out of the rush
      vec2 c = vec2(0.5, 0.48);
      float k = sin(PI*q);
      float sA = 1.0 + 2.2*q*q, sB = 1.0 + 1.4*(1.0-q)*(1.0-q);
      float m = smoothstep(0.42, 0.58, q);
      vec3 ca = vec3(0.0), cb = vec3(0.0);
      for (int i=0;i<20;i++){
        float f = 1.0 - k*0.16*float(i)/19.0;
        vec2 pa = c + (p-c)*f/sA, pb = c + (p-c)*f/sB;
        ca += A(clamp(pa,0.0,1.0)); cb += B(clamp(pb,0.0,1.0));
      }
      col = mix(ca, cb, m)/20.0;
      col *= 1.0 + 0.06*k;
    } else if (uType == 5) {           // lens warp: swirl + barrel + chromatic split
      float k = sin(PI*q);
      vec2 d = (p - 0.5)*vec2(uRes.x/uRes.y, 1.0);
      float r = length(d);
      float ang = 1.7*k*(1.0 - smoothstep(0.0, 0.85, r))*(q < 0.5 ? 1.0 : -1.0);
      float s = sin(ang), c = cos(ang);
      d = vec2(c*d.x - s*d.y, s*d.x + c*d.y);
      float m = smoothstep(0.44, 0.56, q);
      vec3 res = vec3(0.0);
      for (int ch=0; ch<3; ch++){
        float ab = 1.0 + (float(ch)-1.0)*0.022*k;
        vec2 dd = d*mix(1.0, 0.6 + 1.4*r*r, k)*ab;
        vec2 pp = clamp(dd/vec2(uRes.x/uRes.y, 1.0) + 0.5, 0.0, 1.0);
        vec3 v = mix(A(pp), B(pp), m);
        res[ch] = v[ch];
      }
      col = res*(1.0 + 0.15*k);
    } else if (uType == 6) {           // light leak: warm film burn sweeping across a soft dissolve
      vec3 base = mix(A(p), B(p), smoothstep(0.3, 0.7, q));
      float I = pow(sin(PI*q), 1.3);
      float n = fbm(p*vec2(2.0, 3.2) + vec2(q*1.8, q*0.6));
      float sweep = exp(-pow((p.x + 0.25*p.y - (1.5 - 2.0*q))*2.2, 2.0));
      float glow = clamp(sweep*0.9 + n*0.55 - 0.15, 0.0, 1.0);
      vec3 warm = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.86, 0.55), smoothstep(0.2, 0.9, glow));
      vec3 tint = mix(warm, uAccent, 0.25*smoothstep(0.6, 1.0, p.y));
      vec3 leak = tint*glow*I*1.15;
      col = 1.0 - (1.0 - base*(1.0 + 0.15*I))*(1.0 - leak*0.85);
    } else if (uType == 7) {           // slide: B pushes A, light blur
      float e = q < 0.5 ? 8.0*pow(q,4.0) : 1.0 - pow(-2.0*q+2.0,4.0)/2.0;
      float blur = sin(PI*q)*0.06;
      col = vec3(0.0);
      for (int i=0;i<8;i++){ float f=(float(i)/7.0-0.5)*blur; col += strip(p + uDir*f, uDir, e); }
      col /= 8.0;
    } else if (uType == 8) {           // flash: dip through bright white
      float k = pow(sin(PI*q), 2.0);
      col = mix(mix(A(p), B(p), step(0.5, q)), vec3(1.0), k*0.92);
    } else if (uType == 9) {           // lens: zoom into A through a fisheye bulge, B un-bulges out of it
      float asp = uRes.x/uRes.y;
      float ka = pow(clamp(q*2.0, 0.0, 1.0), 2.0), kb = pow(clamp((1.0 - q)*2.0, 0.0, 1.0), 2.0);
      float m = smoothstep(0.44, 0.56, q);
      col = mix(lensA(p, ka, asp), lensB(p, kb, asp), m);
      col *= 1.0 + 0.08*sin(PI*q);
    } else if (uType == 10) {          // mirror: A whips away, B arrives mirrored and stretched, then resolves
      float dx = uDir.x >= 0.0 ? 1.0 : -1.0;
      float m = smoothstep(0.46, 0.54, q);
      vec3 ca = vec3(0.0), cb = vec3(0.0);
      float ea = pow(clamp(q*2.0, 0.0, 1.0), 2.2);
      float eb = pow(clamp((1.0 - q)*2.0, 0.0, 1.0), 1.6);
      for (int i=0;i<20;i++){
        float f = float(i)/19.0 - 0.5;
        ca += A(mw(p + vec2(-dx*(ea*0.7 + f*ea*0.35), 0.0)));
        vec2 pb = p;
        float mx = 0.5 - abs(p.x - 0.5);
        pb.x = mix(p.x, mx, smoothstep(0.15, 0.7, eb));
        pb.y = 0.5 + (p.y - 0.5)/(1.0 + 0.55*eb);
        pb.x += dx*(eb*0.25 + f*eb*0.22);
        cb += B(mw(pb));
      }
      col = mix(ca, cb, m)/20.0;
    } else if (uType == 11) {          // spin: A spins away with rotational blur, B spins in and settles
      float asp = uRes.x/uRes.y;
      float sd = uDir.x >= 0.0 ? 1.0 : -1.0;
      float m = smoothstep(0.45, 0.55, q);
      float ta = clamp(q*2.0, 0.0, 1.0), tb = clamp((1.0 - q)*2.0, 0.0, 1.0);
      float angA = sd*2.4*ta*ta*ta, angB = -sd*2.4*tb*tb*tb;
      float sw = 0.55*sin(PI*q);
      float zA = 1.0 + 0.7*ta*ta, zB = 1.0 + 0.7*tb*tb;
      vec3 ca = vec3(0.0), cb = vec3(0.0);
      vec2 d = (p - 0.5)*vec2(asp, 1.0);
      for (int i=0;i<24;i++){
        float f = (float(i)/23.0 - 0.5)*sw;
        ca += A(mw(0.5 + rot2(d, -(angA + f))/zA/vec2(asp, 1.0)));
        cb += B(mw(0.5 + rot2(d, -(angB + f))/zB/vec2(asp, 1.0)));
      }
      col = mix(ca, cb, m)/24.0;
    } else {
      col = A(p);
    }
    col *= 1.0 - uDarken;
    vec2 v = (p - 0.5)*vec2(1.0, 0.9);
    col *= 1.0 - uVig*smoothstep(0.25, 0.75, length(v));
    col += (hash(gl_FragCoord.xy + vec2(uFrame*17.0, uFrame*31.0)) - 0.5)*uGrain;
    o = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

  function compile(gl, vs, fs) {
    const mk = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aCorner');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return {p, u};
  }

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [0.18, 0.9, 1.0];
    const n = parseInt(m[1], 16);
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255];
  }

  // ---------- engine ----------
  class TourEngine {
    constructor(canvas, overlay, opts = {}) {
      this.canvas = canvas; this.overlayRoot = overlay; this.opts = opts;
      canvas.width = W; canvas.height = H;
      const gl = canvas.getContext('webgl2', {preserveDrawingBuffer: true, antialias: false, premultipliedAlpha: false});
      if (!gl) throw new Error('WebGL2 is not available in this browser.');
      this.gl = gl;
      this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      this.photo = compile(gl, VS_PHOTO, FS_PHOTO);
      this.comp = compile(gl, VS_FULL, FS_COMP);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      this.fbo = [this.makeTarget(), this.makeTarget()];
      this.tex = new Map();   // media id -> {tex, depth, w, h, last}
      this.videos = new Map();
      this.flat = this.makeFlat();
      this.live = false;
    }
    makeTarget() {
      const gl = this.gl;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return {tex, fb};
    }
    makeFlat() {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));
      return t;
    }
    upload(source, mip = true) {
      const gl = this.gl, t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      if (mip) {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, 8);
      } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      return t;
    }
    async loadBitmap(url) {
      const r = await fetch(url, {cache: 'no-cache'});
      if (!r.ok) throw new Error('missing ' + url);
      return createImageBitmap(await r.blob());
    }

    async load(tour, media) {
      this.tour = tour; this.media = media || {};
      this.tl = buildTimeline(tour);
      this.duration = this.tl.duration;
      this.accent = hexToRgb(tour.accent);
      this.buildOverlay();
      await document.fonts.ready;
    }
    setTour(tour) { // editor: cheap update without reloading textures
      this.tour = tour; this.tl = buildTimeline(tour); this.duration = this.tl.duration;
      this.accent = hexToRgb(tour.accent); this.buildOverlay();
    }
    mediaIds(seg) {
      const s = seg.shot, ids = [];
      if (s.media) ids.push(s.media);
      if (s.kind === 'collage' || s.kind === 'grid') (s.tiles || []).forEach(id => ids.push(id));
      if (s.kind === 'specs' && s.bg) ids.push(s.bg);
      if (s.kind === 'outro' && s.bg) ids.push(s.bg);
      return ids;
    }
    async ensure(ids) {
      const now = performance.now();
      await Promise.all(ids.map(async id => {
        const m = this.media[id];
        if (!m) return;
        if (m.kind === 'video') return this.ensureVideo(id, m);
        const have = this.tex.get(id);
        if (have) { have.last = now; return; }
        const entry = {loading: true, last: now, w: m.w, h: m.h};
        this.tex.set(id, entry);
        const bmp = await this.loadBitmap(m.file);
        entry.tex = this.upload(bmp); entry.w = bmp.width; entry.h = bmp.height; bmp.close && bmp.close();
        if (m.depth) { try { const d = await this.loadBitmap(m.depth); entry.depth = this.upload(d, false); d.close && d.close(); } catch (e) { /* no depth */ } }
        entry.loading = false;
      }));
      // keep GPU memory bounded: drop least recently used photos beyond 14
      const photos = [...this.tex.entries()].filter(([, e]) => !e.loading && !e.video).sort((a, b) => b[1].last - a[1].last);
      for (const [id, e] of photos.slice(14)) { this.gl.deleteTexture(e.tex); if (e.depth) this.gl.deleteTexture(e.depth); this.tex.delete(id); }
    }
    ensureVideo(id, m) {
      if (this.videos.has(id)) return this.videos.get(id).ready;
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = m.file;
      const entry = {v, w: m.w, h: m.h, tex: null, video: true};
      entry.ready = new Promise((res, rej) => { v.onloadeddata = () => res(); v.onerror = () => rej(new Error('video ' + m.file)); });
      this.videos.set(id, entry);
      this.tex.set(id, entry);
      return entry.ready;
    }
    async seekVideo(entry, time, exact) {
      const v = entry.v;
      time = clamp(time, 0, Math.max(0, (v.duration || 0) - 0.04));
      if (exact) {
        if (Math.abs(v.currentTime - time) > 1e-3) {
          await new Promise(res => {
            let done = false;
            const fin = () => { if (!done) { done = true; res(); } };
            if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => fin());
            v.addEventListener('seeked', () => setTimeout(fin, 30), {once: true});
            setTimeout(fin, 1500);
            v.currentTime = time;
          });
        }
      } else if (Math.abs(v.currentTime - time) > 0.12) v.currentTime = time;
      const gl = this.gl;
      if (!entry.tex) {
        entry.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, v); } catch (e) { /* not decodable yet */ }
      entry.w = v.videoWidth || entry.w; entry.h = v.videoHeight || entry.h;
    }

    activeAt(t) {
      const segs = this.tl.segs.filter(g => t >= g.vStart && t < g.vEnd);
      if (!segs.length) return this.tl.segs.length ? [this.tl.segs[t <= 0 ? 0 : this.tl.segs.length - 1]] : [];
      return segs.slice(0, 2);
    }
    // camera progress through the shot's visible span (including transition overlap)
    shotU(seg, t) { return span(t, seg.vStart, seg.vEnd); }

    drawPhoto(id, rect, cam, cam0, o = {}) {
      const gl = this.gl, e = this.tex.get(id);
      if (!e || !e.tex) return;
      const P = this.photo, u = P.u;
      gl.useProgram(P.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, e.tex); gl.uniform1i(u.uImg, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, e.depth || this.flat); gl.uniform1i(u.uDepth, 1);
      gl.uniform1f(u.uHasDepth, e.depth ? 1 : 0);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform4f(u.uRect, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform1f(u.uAngle, o.angle || 0);
      gl.uniform1f(u.uRadius, o.radius || 0);
      gl.uniform1f(u.uOpacity, o.opacity == null ? 1 : o.opacity);
      gl.uniform1f(u.uShadow, o.shadow || 0);
      gl.uniform1f(u.uPar, o.parallax || 0);
      gl.uniform1f(u.uLod, o.lod || 0);
      gl.uniform2f(u.uImgSize, e.w || 1, e.h || 1);
      const asp = (e.w || 1) / (e.h || 1), outAsp = rect[2] / rect[3];
      const c = clampCam(cam, asp, outAsp);
      gl.uniform4f(u.uCam, c.x, c.y, c.z, (c.r || 0) * Math.PI / 180);
      const c0 = cam0 ? clampCam(cam0, asp, outAsp) : c;
      gl.uniform3f(u.uCam0, c0.x, c0.y, c0.z);
      const g = Object.assign({}, this.tour.grade || {}, o.grade || {});
      gl.uniform4f(u.uGrade, g.exposure ?? 1.03, g.contrast ?? 1.04, g.saturation ?? 1.06, g.warmth ?? 0.3);
      gl.uniform3f(u.uTint, 0, 0, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Draw one shot (any kind) into a render target.
    drawShot(seg, t, target) {
      const gl = this.gl, s = seg.shot;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb);
      gl.viewport(0, 0, W, H);
      const bg = hexToRgb(s.bgColor || this.tour.bgColor || '#0c0e12');
      gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(this.vao);
      const full = [0, 0, W, H];
      if (s.kind === 'collage') return this.drawCollage(seg, t);
      if (s.kind === 'grid') return this.drawGrid(seg, t);
      if (s.kind === 'specs') {  // soft, bright, blurred photo behind the animated spec cards
        const u = span(t, seg.vStart, seg.vEnd);
        if (s.bg) this.drawPhoto(s.bg, full, {x: 0.5, y: 0.5, z: 1.2 + 0.08 * u}, null, {lod: 5, grade: {exposure: s.theme === 'dark' ? 0.55 : 1.18, saturation: 0.7}});
        return;
      }
      if (s.kind === 'outro') {
        const lt = t - seg.start;
        const cam = {x: 0.5, y: 0.5, z: 1.15 + 0.04 * span(t, seg.vStart, seg.vEnd)};
        if (s.bg) this.drawPhoto(s.bg, full, cam, null, {lod: s.blur ?? 4.5, grade: s.theme === 'light' ? {exposure: 1.2, saturation: 0.6} : {exposure: 0.62, saturation: 0.9}});
        return lt;
      }
      const u = this.shotU(seg, t);
      const cam = camAt(s, u);
      const cam0 = camAt(s, 0);
      if (s.frame === 'card') {
        // small or landscape photo: a blurred, dimmed copy fills the frame and the photo sits sharp in a rounded card
        this.drawPhoto(s.media, full, {x: 0.5, y: 0.5, z: 1.35 + 0.15 * u}, null, {lod: 5, grade: {exposure: 0.48, saturation: 0.8}});
        const e = this.tex.get(s.media) || {};
        const asp = (e.w || 4) / (e.h || 3);
        const grow = 1 + (s.act === 'fast' ? 0.05 : 0.025) * u;
        const cw = 1000 * grow, ch = Math.min(1150, 1000 / asp) * grow, cy = (s.cardY || 820) - (s.act === 'fast' ? 20 * u : 0);
        const rect = [(W - cw) / 2, cy - ch / 2, cw, ch];
        this.drawPhoto(s.media, [rect[0], rect[1] + 30, cw, ch], cam, cam0, {radius: 40, shadow: 0.6});
        this.drawPhoto(s.media, rect, cam, cam0, {radius: 40, parallax: s.parallax || 0, grade: s.grade});
        return;
      }
      this.drawPhoto(s.media, full, cam, cam0, {parallax: s.parallax || 0, grade: s.grade});
    }

    // Opening: three columns of rounded photo tiles drifting in opposite directions,
    // then the hero tile grows to full screen and becomes the first shot.
    drawCollage(seg, t) {
      const s = seg.shot, lt = t - seg.start;
      const tiles = (s.tiles || []).filter(id => this.tex.get(id));
      const T = Object.assign({inEnd: 0.7, expandStart: 1.5, expandEnd: 2.3}, s.timing || {});
      const cols = 3, gap = 26, tw = (W - 120 - gap * (cols - 1)) / cols, th = tw * 1.42;
      const angle = -0.07 * (1 - ease('inOutCubic', span(lt, T.expandStart, T.expandEnd)));
      const fadeOthers = 1 - ease('outCubic', span(lt, T.expandStart, T.expandEnd - 0.2));
      const cx = W / 2, cy = H / 2;
      const rot = (x, y) => { const dx = x - cx, dy = y - cy, sn = Math.sin(angle), cs = Math.cos(angle); return [cx + cs * dx - sn * dy, cy + sn * dx + cs * dy]; };
      let heroRect = null;
      const heroCol = 1, heroRow = 1;
      if (fadeOthers > 0.001) {
        for (let c = 0; c < cols; c++) {
          const drift = (c % 2 ? 1 : -1) * 160 * ease('soft', span(lt, 0, T.expandEnd + 0.5));
          for (let r = -1; r < 4; r++) {
            const idx = ((c * 5 + r + 5) % Math.max(1, tiles.length));
            const id = tiles[idx];
            if (!id) continue;
            const x = 60 + c * (tw + gap), y = cy - th * 1.5 - gap + r * (th + gap) + drift;
            const appear = ease('outBack', span(lt, 0.05 * (c + r + 1), 0.05 * (c + r + 1) + T.inEnd));
            const sc = lerp(0.6, 1, appear);
            const isHero = c === heroCol && r === heroRow;
            const [px, py] = rot(x + tw / 2, y + th / 2);
            const rect = [px - tw * sc / 2, py - th * sc / 2, tw * sc, th * sc];
            if (isHero) { heroRect = {cx: px, cy: py, w: tw, h: th, sc}; continue; }
            const op = appear * fadeOthers;
            this.drawPhoto(id, [rect[0] + 10, rect[1] + 24, rect[2], rect[3]], {x: .5, y: .5, z: 1.0}, null, {radius: 34, angle, opacity: op, shadow: 0.45});
            this.drawPhoto(id, rect, {x: 0.5, y: 0.5, z: 1.04 + 0.05 * span(lt, 0, 3)}, null, {radius: 34, angle, opacity: op});
          }
        }
      }
      // hero
      const heroId = s.media;
      if (!heroId || !this.tex.get(heroId)) return;
      const k = ease('inOutCubic', span(lt, T.expandStart, T.expandEnd));
      const hr = heroRect || {cx: W / 2, cy: H / 2, w: tw, h: th, sc: 1};
      const w = lerp(hr.w * hr.sc, W, k), h = lerp(hr.h * hr.sc, H, k);
      const x = lerp(hr.cx, W / 2, k) - w / 2, y = lerp(hr.cy, H / 2, k) - h / 2;
      const u = span(t, seg.start + T.expandStart, seg.vEnd);
      const cam = camAt(s, u), cam0 = camAt(s, 0);
      const appear = ease('outBack', span(lt, 0.15, 0.15 + T.inEnd));
      const sc = k > 0 ? 1 : lerp(0.6, 1, appear);
      const rect = [x + w * (1 - sc) / 2, y + h * (1 - sc) / 2, w * sc, h * sc];
      if (k < 0.98) this.drawPhoto(heroId, [rect[0] + 10, rect[1] + 24, rect[2], rect[3]], cam, cam0, {radius: 34 * (1 - k), angle: angle * (1 - k), shadow: 0.5 * (1 - k), opacity: appear});
      this.drawPhoto(heroId, rect, cam, cam0, {radius: 34 * (1 - k), angle: angle * (1 - k), parallax: (s.parallax || 0) * k, opacity: k > 0 ? 1 : appear});
    }

    // Opening hook decoded from the reference: one rounded card grows, splits into two rows, then three rows of
    // rounded photo cards that slide sideways like carousels (alternate directions); the middle row's last card is
    // the hero, which expands to full screen and keeps panning as the first shot.
    drawGrid(seg, t) {
      const s = seg.shot, lt = t - seg.start;
      const T = Object.assign({grow: 0.75, two: 0.85, three: 1.75, swipes: [2.25, 2.95], expand: 3.45, expandEnd: 4.05}, s.timing || {});
      const tiles = (s.tiles || []).filter(id => this.tex.get(id));
      const hero = s.media;
      if (!tiles.length || !this.tex.get(hero)) return;
      const M = 40, G = 22, TOP = 110, HC = 1700, CW = W - 2 * M;
      const pick = k => tiles[((k % tiles.length) + tiles.length) % tiles.length];
      const h2 = (HC - G) / 2, h3 = (HC - 2 * G) / 3;
      const R = {
        small: [140, 760, 800, 400], full: [M, TOP, CW, HC],
        two: [[M, TOP, CW, h2], [M, TOP + h2 + G, CW, h2]],
        three: [0, 1, 2].map(i => [M, TOP + i * (h3 + G), CW, h3]),
      };
      const off = (r, dy) => [r[0], r[1] + dy, r[2], r[3]];
      const L = (a, b, k) => a.map((v, i) => lerp(v, b[i], k));
      const kGrow = ease('outCubic', span(lt, 0, T.grow));
      const kTwo = ease('inOutCubic', span(lt, T.two, T.two + 0.4));
      const kThree = ease('inOutCubic', span(lt, T.three, T.three + 0.4));
      const kExp = ease('inOutCubic', span(lt, T.expand, T.expandEnd));
      const rows = [
        {dir: 1, delay: 0, list: k => pick(k), rect: L(L(L(L(R.small, R.full, kGrow), R.two[0], kTwo), R.three[0], kThree), off(R.three[0], -900), kExp), on: true},
        {dir: -1, delay: 0.12, list: k => (k === -2 ? hero : pick(k + 3)), rect: L(L(L(off(R.two[1], 1000), R.two[1], kTwo), R.three[1], kThree), [0, 0, W, H], kExp), on: lt >= T.two},
        {dir: 1, delay: 0.24, list: k => pick(k + 5), rect: L(L(off(R.three[2], 900), R.three[2], kThree), off(R.three[2], 900), kExp), on: lt >= T.three},
      ];
      const u = span(t, seg.start + T.expand, seg.vEnd);
      const heroCam = camAt(s, u), heroCam0 = camAt(s, 0);
      // draw the expanding middle row last so it sits on top
      [0, 2, 1].forEach(ri => {
        const row = rows[ri];
        if (!row.on) return;
        const [x, y, w, h] = row.rect;
        const radius = ri === 1 ? 38 * (1 - kExp) : 38;
        let pos = 0;
        T.swipes.forEach(sw => { pos += row.dir * ease('inOutCubic', span(lt, sw + row.delay, sw + row.delay + 0.38)); });
        const k0 = Math.floor(pos);
        for (let k = k0; k <= k0 + 1; k++) {
          if (k === k0 + 1 && pos - k0 < 1e-3) continue;  // no peeking neighbour while the row is at rest
          const id = row.list(k);
          const cx = x + (k - pos) * (w + G);
          if (cx > W || cx + w < 0) continue;
          const isHero = id === hero && ri === 1 && k === -2;
          const drift = {x: 0.5 + 0.05 * row.dir * Math.sin(lt * 0.6), y: 0.5, z: 1.06};
          const cam = isHero ? heroCam : drift;
          if (kExp < 0.95) this.drawPhoto(id, [cx + 6, y + 18, w, h], cam, null, {radius, shadow: 0.35 * (1 - kExp)});
          this.drawPhoto(id, [cx, y, w, h], cam, isHero ? heroCam0 : null, {radius, parallax: isHero ? (s.parallax || 0) * kExp : 0});
        }
      });
    }

    async prepare(t, exact) {
      const segs = this.activeAt(t);
      const ids = [];
      segs.forEach(g => ids.push(...this.mediaIds(g)));
      // look ahead so the next shot is ready before it is needed
      const next = this.tl.segs.find(g => g.vStart > t);
      if (next && next.vStart - t < 2.5) ids.push(...this.mediaIds(next));
      await this.ensure(ids);
      for (const g of segs) {
        const m = this.media[g.shot.media];
        if (m && m.kind === 'video') {
          const entry = this.videos.get(g.shot.media);
          const local = (t - g.vStart) * (g.shot.speed || 1) + (g.shot.clipIn || 0);
          await this.seekVideo(entry, local, exact);
        }
      }
      return segs;
    }

    async renderAt(t, exact = true) {
      const segs = await this.prepare(t, exact);
      this.draw(t, segs);
      this.updateOverlay(t);
    }
    draw(t, segs) {
      const gl = this.gl;
      if (!segs.length) return;
      const [a, b] = segs;
      this.drawShot(a, t, this.fbo[0]);
      let type = 0, q = 0, dir = [-1, 0];
      if (b) {
        this.drawShot(b, t, this.fbo[1]);
        const tr = a.shot.transition || {};
        type = TRANSITIONS[tr.type] || 2;
        const d = trDur(a.shot) || 0.001;
        q = span(t, b.start - d / 2, b.start + d / 2);
        dir = DIRS[tr.dir] || [-1, 0];
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, W, H);
      gl.disable(gl.BLEND);
      const C = this.comp, u = C.u;
      gl.useProgram(C.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.fbo[0].tex); gl.uniform1i(u.uA, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fbo[1].tex); gl.uniform1i(u.uB, 1);
      gl.uniform1f(u.uQ, q); gl.uniform1i(u.uType, type); gl.uniform2f(u.uDir, dir[0], dir[1]);
      gl.uniform3f(u.uAccent, ...this.accent);
      gl.uniform2f(u.uRes, W, H);
      gl.uniform1f(u.uFrame, Math.round(t * (this.tour.fps || 30)) % 997);
      const look = this.tour.look || {};
      gl.uniform1f(u.uGrain, look.grain ?? 0.035);
      gl.uniform1f(u.uVig, look.vignette ?? 0.22);
      gl.uniform1f(u.uDarken, 0);
      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // ---------- DOM overlay ----------
    buildOverlay() {
      const root = this.overlayRoot;
      if (!root) return;
      root.innerHTML = '';
      root.style.setProperty('--accent', this.tour.accent || '#2EE6FF');
      this.items = [];
      const tour = this.tour;
      const roomOrder = [];
      this.tl.segs.forEach(g => { const r = g.shot.room; if (r && g.shot.act !== 'fast' && g.shot.kind !== 'collage' && g.shot.kind !== 'outro' && !roomOrder.includes(r)) roomOrder.push(r); });
      this.tl.segs.forEach((g, i) => {
        const s = g.shot;
        const exit = g.end - g.tout / 2 - 0.3;
        if (s.label && s.label.text) this.items.push(makeLabel(root, g, s.label, exit, roomOrder));
        if (s.stats && s.stats.length) {  // a column on full-frame shots, a row above the photo on card shots
          const holder = el('div', 'stats' + (s.frame === 'card' ? ' row' : ''), root);
          if (s.stats[0].y) holder.style.top = s.stats[0].y + 'px';
          s.stats.forEach((st, k) => this.items.push(makeStat(holder, g, st, exit, k)));
        }
        if ((s.kind === 'collage' || s.kind === 'grid') && s.title) this.items.push(s.title.style === 'ref' ? makeRefTitle(root, g, s.title, exit) : makeTitle(root, g, s.title, exit));
        if (s.kind === 'specs') this.items.push(makeSpecs(root, g, s, exit));
        if (s.kind === 'outro') this.items.push(makeOutro(root, g, s, tour));
      });
      if (tour.tracker !== false && roomOrder.length > 1) this.items.push(makeTracker(root, this.tl, roomOrder));
    }
    updateOverlay(t) { (this.items || []).forEach(it => it.update(t)); }
  }

  // ---- overlay builders: each returns {update(t)} and sets styles from t only ----
  function el(tag, cls, parent, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // letters grouped in word boxes so a line never breaks inside a word
  function splitLetters(node, text) {
    const spans = [];
    String(text).split(/(\s+)/).forEach(part => {
      if (!part) return;
      if (/^\s+$/.test(part)) { node.appendChild(document.createTextNode(' ')); return; }
      const w = el('span', 'word', node);
      [...part].forEach(ch => spans.push(el('span', 'ch', w, ch)));
    });
    return spans;
  }
  function letterIn(spans, t, t0, stagger, dur, dy = 22, blur = 10) {
    spans.forEach((sp, i) => {
      const k = ease('outCubic', span(t, t0 + i * stagger, t0 + i * stagger + dur));
      sp.style.opacity = k;
      sp.style.transform = `translateY(${(1 - k) * dy}px)`;
      sp.style.filter = k < 0.999 ? `blur(${(1 - k) * blur}px)` : 'none';
    });
  }
  function letterOut(spans, t, t0, stagger, dur) {
    const n = spans.length;
    spans.forEach((sp, i) => {
      const j = n - 1 - i;
      const k = ease('inCubic', span(t, t0 + j * stagger, t0 + j * stagger + dur));
      if (k <= 0) return;
      sp.style.opacity = (parseFloat(sp.style.opacity) || 0) * (1 - k);
      sp.style.transform = `translateY(${-k * 14}px)`;
      sp.style.filter = `blur(${k * 8}px)`;
    });
  }
  function visible(node, on) { node.style.display = on ? '' : 'none'; }

  function makeLabel(root, g, lab, exit, rooms) {
    if (lab.style === 'punch') return makePunch(root, g, lab, exit);
    if (lab.style === 'ref') return makeRefLabel(root, g, lab, exit);
    const box = el('div', 'lbl ' + (lab.style || ''), root);
    if (lab.y) box.style.top = lab.y + 'px';
    else if (g.shot.frame === 'card') box.style.top = '1250px';
    const idx = rooms.indexOf(g.shot.room);
    const kickerText = lab.kicker != null ? lab.kicker : (g.shot.room ? `${String(idx + 1).padStart(2, '0')}  ·  ${g.shot.room}` : '');
    const kicker = kickerText ? el('div', 'kicker', box, kickerText) : null;
    const txt = el('div', 'txt', box);
    const len = lab.text.length;
    if (lab.size) txt.style.fontSize = lab.size + 'px';
    else if (len > 26) txt.style.fontSize = '56px';
    else if (len > 17) txt.style.fontSize = '66px';
    const spans = splitLetters(txt, lab.text);
    const bar = el('div', 'bar', box);
    const t0 = g.start + (lab.at ?? 0.45);
    const t1 = lab.out != null ? g.start + lab.out : exit;
    const stagger = Math.min(0.03, 0.55 / Math.max(1, spans.length));
    return {update(t) {
      const on = t >= t0 - 0.01 && t <= t1 + 0.6;
      visible(box, on);
      if (!on) return;
      letterIn(spans, t, t0 + 0.08, stagger, 0.5);
      letterOut(spans, t, t1, stagger * 0.6, 0.3);
      const kb = ease('outExpo', span(t, t0 + 0.1, t0 + 0.8)) * (1 - ease('inCubic', span(t, t1, t1 + 0.35)));
      bar.style.transform = `scaleX(${kb})`;
      if (kicker) {
        const kk = ease('outCubic', span(t, t0, t0 + 0.45)) * (1 - ease('inCubic', span(t, t1 + 0.05, t1 + 0.35)));
        kicker.style.opacity = kk; kicker.style.transform = `translateX(${(1 - kk) * -24}px)`;
      }
    }};
  }

  // fast act: one big word slams in (scale + blur), holds across the room's quick shots, snaps out
  function makePunch(root, g, lab, exit) {
    const box = el('div', 'lbl punch', root);
    if (lab.y) box.style.top = lab.y + 'px';
    const txt = el('div', 'txt', box);
    if (lab.size) txt.style.fontSize = lab.size + 'px';
    const spans = splitLetters(txt, lab.text);
    const bar = el('div', 'bar', box);
    let fitted = !!lab.size;
    const fit = () => {  // shrink the word until it fits the safe width (x 72..950)
      fitted = true;
      const avail = 860, w = txt.scrollWidth;
      if (w > avail) txt.style.fontSize = Math.floor(parseFloat(getComputedStyle(txt).fontSize) * avail / w) + 'px';
    };
    const t0 = g.start + (lab.at ?? 0.08);
    const t1 = lab.out != null ? g.start + lab.out : exit;
    return {update(t) {
      const on = t >= t0 - 0.01 && t <= t1 + 0.3;
      visible(box, on);
      if (!on) return;
      if (!fitted) fit();
      spans.forEach((sp, i) => {
        const k = ease('outCubic', span(t, t0 + i * 0.018, t0 + i * 0.018 + 0.22));
        const o = ease('inCubic', span(t, t1 + i * 0.01, t1 + i * 0.01 + 0.16));
        sp.style.opacity = k * (1 - o);
        sp.style.transform = `scale(${lerp(1.6, 1, k) + o * 0.3}) translateY(${-o * 20}px)`;
        sp.style.filter = k < 0.999 || o > 0 ? `blur(${(1 - k) * 16 + o * 10}px)` : 'none';
      });
      const drift = span(t, t0, t1);
      txt.style.transform = `scale(${1 + 0.06 * drift})`;
      bar.style.transform = `scaleX(${ease('outExpo', span(t, t0 + 0.05, t0 + 0.4)) * (1 - ease('inCubic', span(t, t1, t1 + 0.15)))})`;
    }};
  }

  function makeStat(root, g, st, exit, k) {
    const box = el('div', 'stat', root);
    const v = el('div', 'v', box);
    const num = el('span', 'num', v, st.value || '');
    if (st.unit) el('span', 'unit', v, ' ' + st.unit);
    if (st.caption) el('div', 'c', box, st.caption);
    const t0 = g.start + (st.at ?? 1.0) + k * 0.25;
    const t1 = st.out != null ? g.start + st.out : exit;
    const m = /^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/.exec(st.value || '');
    const target = m ? parseFloat(m[2].replace(/,/g, '')) : null;
    const decimals = m && m[2].includes('.') ? m[2].split('.')[1].length : 0;
    const fmt = n => (m[2].includes(',') ? n.toLocaleString('en-IN', {minimumFractionDigits: decimals, maximumFractionDigits: decimals}) : n.toFixed(decimals));
    return {update(t) {
      const on = t >= t0 - 0.01 && t <= t1 + 0.5;
      visible(box, on);
      if (!on) return;
      const a = ease('outCubic', span(t, t0, t0 + 0.55)), b = ease('inCubic', span(t, t1, t1 + 0.35));
      box.style.opacity = a * (1 - b);
      box.style.transform = `translateX(${(1 - a) * -60 - b * 30}px)`;
      box.style.clipPath = `inset(0 ${(1 - a) * 100}% 0 0 round 22px)`;
      if (target != null && st.count !== false) num.textContent = m[1] + fmt(target * ease('outExpo', span(t, t0 + 0.1, t0 + 1.2))) + m[3];
    }};
  }

  // ---- reference-style text: letters appear (and later vanish) in a random order, over a thin accent underline
  function shuffled(n, seed) {
    const idx = [...Array(n).keys()];
    let x = seed || 1;
    for (let i = n - 1; i > 0; i--) { x = (x * 1103515245 + 12345) % 2147483648; const j = x % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const rank = Array(n); idx.forEach((v, i) => { rank[v] = i; }); return rank;
  }
  const seedOf = str => [...String(str)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 2147483647, 7);
  function randomLetters(spans, t, tIn, tOut, seed, spread = 0.75, fade = 0.28) {
    const n = spans.length, rin = shuffled(n, seed), rout = shuffled(n, seed * 3 + 1);
    spans.forEach((sp, i) => {
      const a = ease('outCubic', span(t, tIn + rin[i] / n * spread, tIn + rin[i] / n * spread + fade));
      const b = ease('inCubic', span(t, tOut + rout[i] / n * spread * 0.7, tOut + rout[i] / n * spread * 0.7 + fade * 0.8));
      const k = a * (1 - b);
      sp.style.opacity = k;
      sp.style.filter = k < 0.995 ? `blur(${(1 - k) * 7}px)` : 'none';
      sp.style.transform = `translateY(${(1 - a) * 6 - b * 6}px)`;
    });
  }
  function makeRefLabel(root, g, lab, exit) {
    const box = el('div', 'rlbl', root);
    if (lab.y) box.style.top = lab.y + 'px';
    const txt = el('div', 'txt', box);
    const spans = splitLetters(txt, lab.text);
    const bar = el('div', 'bar', box);
    const sub = lab.sub ? el('div', 'sub', box) : null;
    const subSpans = sub ? splitLetters(sub, lab.sub) : [];
    const t0 = g.start + (lab.at ?? 0.5), t1 = lab.out != null ? g.start + lab.out : exit - 0.35;
    const seed = seedOf(lab.text);
    return {update(t) {
      const on = t >= t0 - 0.01 && t <= t1 + 1.0;
      visible(box, on);
      if (!on) return;
      randomLetters(spans, t, t0 + 0.1, t1, seed);
      if (sub) randomLetters(subSpans, t, t0 + 0.55, t1 - 0.1, seed + 11, 0.6, 0.25);
      const grow = ease('outExpo', span(t, t0, t0 + 0.55)), shrink = ease('inOutCubic', span(t, t1 - 0.15, t1 + 0.45));
      bar.style.transform = `scaleX(${grow * (1 - shrink)})`;
    }};
  }
  function makeRefTitle(root, g, title, exit) {
    const box = el('div', 'rtitle', root);
    if (title.y) box.style.top = title.y + 'px';
    const big = el('div', 'big', box);
    const spans = splitLetters(big, title.text || '');
    const sub = title.sub ? el('div', 'sub', box) : null;
    const subSpans = sub ? splitLetters(sub, title.sub) : [];
    const chip = title.price ? el('div', 'chip', box, title.price) : null;
    const t0 = g.start + (title.at ?? 3.6), t1 = title.out != null ? g.start + title.out : exit - 0.3;
    const seed = seedOf(title.text);
    return {update(t) {
      const on = t >= t0 - 0.01 && t <= t1 + 1.0;
      visible(box, on);
      if (!on) return;
      randomLetters(spans, t, t0, t1, seed, 0.6, 0.3);
      if (sub) randomLetters(subSpans, t, t0 + 0.45, t1, seed + 5, 0.7, 0.25);
      if (chip) {
        const k = ease('outBack', span(t, t0 + 0.9, t0 + 1.35)), o = ease('inCubic', span(t, t1, t1 + 0.3));
        chip.style.opacity = clamp(k, 0, 1) * (1 - o); chip.style.transform = `scale(${lerp(0.7, 1, clamp(k, 0, 1.2))})`;
      }
      // a light sweep across the title once it has landed
      const sw = span(t, t0 + 0.8, t0 + 1.8);
      big.style.backgroundPosition = `${lerp(130, -30, sw)}% 0`;
    }};
  }
  const ICONS = {
    bed: '<path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M3 14h18M6 10V7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/>',
    bath: '<path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM6 12V6a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2M7 19l-1 2M17 19l1 2"/>',
    balcony: '<path d="M4 21V11M20 21V11M3 11h18M8 11v10M12 11v10M16 11v10M3 21h18M7 11V5a5 5 0 0 1 10 0v6"/>',
    area: '<path d="M4 4h16v16H4zM4 9h5V4M20 15h-5v5"/>',
    floor: '<path d="M4 21V9l8-5 8 5v12M4 21h16M9 21v-5h6v5M9 11h6"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/>',
    parking: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V8h3a3 3 0 0 1 0 6h-3"/>',
    sofa: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3v-5zM6 18v2M18 18v2"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l3 3M14 9l2 2"/>',
    road: '<path d="M8 3L4 21M16 3l4 18M12 5v2M12 11v2M12 17v2"/>',
    rupee: '<path d="M7 5h10M7 9h10M9 5c4 0 5 4 0 4H7l8 10"/>',
  };
  function makeSpecs(root, g, s, exit) {
    const box = el('div', 'specs' + (s.theme === 'dark' ? ' dark' : ''), root);
    const head = s.heading ? el('div', 'sp-head', box, s.heading) : null;
    const grid = el('div', 'sp-grid', box);
    const cells = (s.items || []).map(it => {
      const c = el('div', 'sp-cell', grid);
      const ic = el('div', 'sp-ic', c);
      ic.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[it.icon] || ICONS.key}</svg>`;
      const v = el('div', 'sp-v', c, it.value);
      if (it.unit) el('span', 'sp-u', v, ' ' + it.unit);
      el('div', 'sp-c', c, it.caption || '');
      const m = /^(\d+)(.*)$/.exec(it.value || '');
      return {c, v, m, unit: it.unit};
    });
    const t0 = g.start + (s.at ?? 0.35), t1 = exit;
    return {update(t) {
      const on = t >= t0 - 0.01 && t <= t1 + 0.8;
      visible(box, on);
      if (!on) return;
      const out = ease('inCubic', span(t, t1, t1 + 0.4));
      if (head) { const k = ease('outCubic', span(t, t0, t0 + 0.5)); head.style.opacity = k * (1 - out); head.style.transform = `translateY(${(1 - k) * 24}px)`; }
      cells.forEach((cell, i) => {
        const k = ease('outBack', span(t, t0 + 0.25 + i * 0.16, t0 + 0.75 + i * 0.16));
        const kk = clamp(k, 0, 1);
        cell.c.style.opacity = kk * (1 - out);
        cell.c.style.transform = `translateY(${(1 - kk) * 40}px) scale(${lerp(0.82, 1, clamp(k, 0, 1.1)) - out * 0.05})`;
        if (cell.m) {
          const n = Math.round(parseInt(cell.m[1], 10) * ease('outExpo', span(t, t0 + 0.35 + i * 0.16, t0 + 1.4 + i * 0.16)));
          cell.v.firstChild.nodeValue = n + cell.m[2];
        }
      });
    }};
  }

  function makeTitle(root, g, title, exit) {
    const box = el('div', 'title', root);
    if (title.y) box.style.top = title.y + 'px';
    const big = el('div', 'big', box);
    const spans = splitLetters(big, title.text || '');
    const sub = title.sub ? el('div', 'sub', box, title.sub) : null;
    const chip = title.price ? el('div', 'chip', box, title.price) : null;
    const t0 = g.start + (title.at ?? 2.1);
    const t1 = title.out != null ? g.start + title.out : exit;
    return {update(t) {
      const on = t >= t0 - 0.01 && t <= t1 + 0.6;
      visible(box, on);
      if (!on) return;
      spans.forEach((sp, i) => {
        const k = ease('outBack', span(t, t0 + i * 0.05, t0 + i * 0.05 + 0.55));
        const kk = clamp(k, 0, 1);
        sp.style.opacity = kk;
        sp.style.transform = `translateY(${(1 - k) * 90}px) scale(${lerp(1.25, 1, kk)})`;
        sp.style.filter = kk < 0.999 ? `blur(${(1 - kk) * 14}px)` : 'none';
      });
      letterOut(spans, t, t1, 0.03, 0.3);
      const out = 1 - ease('inCubic', span(t, t1, t1 + 0.35));
      if (sub) { const k = ease('outCubic', span(t, t0 + 0.35, t0 + 0.85)); sub.style.opacity = k * out; sub.style.transform = `translateY(${(1 - k) * 20}px)`; }
      if (chip) { const k = ease('outBack', span(t, t0 + 0.6, t0 + 1.1)); chip.style.opacity = clamp(k, 0, 1) * out; chip.style.transform = `scale(${lerp(0.6, 1, clamp(k, 0, 1.2))})`; }
    }};
  }

  function makeOutro(root, g, s, tour) {
    const a = s.agent || tour.agent || {};
    const box = el('div', 'outro' + (s.theme === 'light' ? ' light' : ''), root);
    const shade = el('div', 'o-shade', box);
    const card = el('div', 'card', box);
    const parts = [];
    if (s.kicker !== '') parts.push(el('div', 'o-kicker', card, s.kicker || 'Interested?'));
    if (s.headline) parts.push(el('div', 'o-head', card, s.headline));
    if (a.photo) { const ph = el('div', 'o-photo', card); const img = el('img', '', ph); img.src = a.photo; parts.push(ph); }
    if (a.name) parts.push(el('div', 'o-name', card, a.name));
    if (a.company) parts.push(el('div', 'o-company', card, a.company));
    const meta = [a.badge || '', a.since ? `Trusted since ${a.since}` : '', a.rera ? `RERA ${a.rera}` : ''].filter(Boolean).join('  ·  ');
    if (meta) parts.push(el('div', 'o-meta', card, meta));
    if (a.phone || s.ctaMain) {  // without a phone number, ctaMain (e.g. the agency name) fills the button
      const c = el('div', 'o-cta', card); el('div', 'o-cta-l', c, s.cta || 'Call / WhatsApp'); el('div', 'o-cta-n', c, a.phone || s.ctaMain); parts.push(c);
      if (!a.phone) c.querySelector('.o-cta-n').style.fontSize = '46px';
    }
    if (s.footer) parts.push(el('div', 'o-foot', card, s.footer));
    const t0 = g.start + (s.at ?? 0.25);
    return {update(t) {
      const on = t >= g.start - 0.4;
      visible(box, on);
      if (!on) return;
      const k = ease('outCubic', span(t, t0, t0 + 0.6));
      shade.style.opacity = ease('inOutSine', span(t, g.start - 0.4, t0 + 0.4));
      card.style.opacity = k;
      card.style.transform = `translateY(${(1 - k) * 60}px) scale(${lerp(0.96, 1, k)})`;
      parts.forEach((p, i) => {
        const kk = ease('outCubic', span(t, t0 + 0.2 + i * 0.09, t0 + 0.7 + i * 0.09));
        p.style.opacity = kk; p.style.transform = `translateY(${(1 - kk) * 24}px)`;
      });
    }};
  }

  function makeTracker(root, tl, rooms) {
    const box = el('div', 'tracker', root);
    const cells = rooms.map(r => { const c = el('div', 'cell', box); el('div', 'nm', c, r); const bar = el('div', 'tb', c); const fill = el('div', 'tf', bar); return {c, fill, r}; });
    const roomSpan = {};
    tl.segs.forEach(g => { const r = g.shot.room; if (!rooms.includes(r) || g.shot.act === 'fast' || g.shot.kind === 'collage' || g.shot.kind === 'outro') return; const sp = roomSpan[r] || (roomSpan[r] = [g.start, g.end]); sp[0] = Math.min(sp[0], g.start); sp[1] = Math.max(sp[1], g.end); });
    const first = Math.min(...rooms.map(r => roomSpan[r][0])), last = Math.max(...rooms.map(r => roomSpan[r][1]));
    return {update(t) {
      const on = t >= first - 0.2 && t <= last + 0.4;
      visible(box, on);
      if (!on) return;
      box.style.opacity = ease('outCubic', span(t, first - 0.2, first + 0.4)) * (1 - ease('inCubic', span(t, last - 0.2, last + 0.3)));
      cells.forEach(({c, fill, r}) => {
        const [a, b] = roomSpan[r];
        const p = span(t, a, b);
        fill.style.transform = `scaleX(${p})`;
        c.classList.toggle('on', t >= a && t < b);
      });
    }};
  }

  window.TourEngine = TourEngine;
  window.TourMath = {buildTimeline, camAt, clampCam, viewSize, EASE, ease, trDur, TRANSITIONS};
})();
