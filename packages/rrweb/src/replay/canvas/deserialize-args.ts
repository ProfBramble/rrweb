import { decode } from 'base64-arraybuffer';
import type { Replayer } from '../';
import { CanvasArg, SerializedCanvasArg } from '../../types';

// TODO: add ability to wipe this list
type GLVarMap = Map<string, any[]>;
const webGLVarMap: Map<
  CanvasRenderingContext2D | WebGLRenderingContext | WebGL2RenderingContext,
  GLVarMap
> = new Map();
export function variableListFor(
  ctx:
    | CanvasRenderingContext2D
    | WebGLRenderingContext
    | WebGL2RenderingContext,
  ctor: string,
) {
  let contextMap = webGLVarMap.get(ctx);
  if (!contextMap) {
    contextMap = new Map();
    webGLVarMap.set(ctx, contextMap);
  }
  if (!contextMap.has(ctor)) {
    contextMap.set(ctor, []);
  }
  return contextMap.get(ctor) as any[];
}

export function isSerializedArg(arg: unknown): arg is SerializedCanvasArg {
  return Boolean(arg && typeof arg === 'object' && 'rr_type' in arg);
}

export function deserializeArg(
  imageMap: Replayer['imageMap'],
  ctx:
    | CanvasRenderingContext2D
    | WebGLRenderingContext
    | WebGL2RenderingContext,
): (arg: CanvasArg) => Promise<any> {
  return async (arg: CanvasArg): Promise<any> => {
    if (arg && typeof arg === 'object' && 'rr_type' in arg) {
      if (arg.rr_type === 'ImageBitmap' && 'args' in arg) {
        const args = await deserializeArg(imageMap, ctx)(arg.args);
        return await createImageBitmap.apply(null, args);
      } else if ('index' in arg) {
        const { rr_type: name, index } = arg;
        return variableListFor(ctx, name)[index];
      } else if ('args' in arg) {
        const { rr_type: name, args } = arg;
        const ctor = window[name as keyof Window];

        return new ctor(
          ...(await Promise.all(args.map(deserializeArg(imageMap, ctx)))),
        );
      } else if ('base64' in arg) {
        return decode(arg.base64);
      } else if ('src' in arg) {
        const image = imageMap.get(arg.src);
        if (image) {
          return image;
        } else {
          const image = new Image();
          image.src = arg.src;
          imageMap.set(arg.src, image);
          return image;
        }
      } else if ('data' in arg && arg.rr_type === 'Blob') {
        const blobContents = await Promise.all(
          arg.data.map(deserializeArg(imageMap, ctx)),
        );
        const blob = new Blob(blobContents, {
          type: arg.type,
        });
        return blob;
      }
    } else if (Array.isArray(arg)) {
      const result = await Promise.all(arg.map(deserializeArg(imageMap, ctx)));
      return result;
    }
    return arg;
  };
}
