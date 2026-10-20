import { RepeatWrapping, Texture } from 'three';
import { GLTF, GLTFLoader, GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Loads a binary glTF without the loader's own requests. A data URL (the
 * single-file build) is decoded in memory and its embedded images go through
 * createImageBitmap. The stock loader fetches the data URL and its images
 * (as blob URLs), which a sandboxed page with a strict content policy refuses,
 * so the scene would never finish loading. Any other URL (the dev server, a
 * normal deployment) is fetched as a file.
 */
export async function loadGlb(url: string): Promise<GLTF> {
  let buffer: ArrayBuffer;
  if (url.startsWith('data:')) {
    const raw = atob(url.slice(url.indexOf(',') + 1));
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    buffer = bytes.buffer;
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`loadGlb: ${res.status} for ${url}`);
    buffer = await res.arrayBuffer();
  }
  const loader = new GLTFLoader();
  loader.register((parser) => new InlineTextures(parser));
  return new Promise((resolve, reject) => loader.parse(buffer, '', resolve, reject));
}

/** Decodes textures stored in buffer views straight from memory. */
class InlineTextures implements GLTFLoaderPlugin {
  readonly name = 'DRUNKFURT_inline_textures';
  constructor(private parser: GLTFParser) {}

  loadTexture(textureIndex: number): Promise<Texture> | null {
    const json = this.parser.json;
    const def = json.textures[textureIndex];
    const image = def.source !== undefined ? json.images[def.source] : undefined;
    if (!image || image.bufferView === undefined) return null;
    return this.parser
      .getDependency('bufferView', image.bufferView)
      .then((data: ArrayBuffer) =>
        createImageBitmap(new Blob([data], { type: image.mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }),
      )
      .then((bitmap) => {
        const t = new Texture(bitmap);
        t.flipY = false; // glTF images are stored top row first
        t.wrapS = t.wrapT = RepeatWrapping;
        t.needsUpdate = true;
        return t;
      });
  }
}
