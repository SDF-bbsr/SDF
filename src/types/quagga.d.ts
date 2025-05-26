// src/types/quagga.d.ts 
declare module 'quagga' {
  export interface QuaggaDetectionResult { // Corrected typo: Deteccion -> Detection
    codeResult: {
      code: string | null;
      start?: number;
      end?: number;
      direction?: number;
      startInfo?: {
        error?: number;
        code?: number;
        start?: number;
        end?: number;
      };
      decodedCodes?: Array<{
        code: string | number;
        format: string; // e.g., "code_128", "ean_13"
        error?: number;
      }>;
      format?: string;
    };
    line?: Array<{
      x: number;
      y: number;
    }>;
    angle?: number;
    pattern?: any; // Can be complex, using 'any' for simplicity
    box?: Array<[number, number]>; // Array of [x,y] points
    boxes?: Array<Array<[number, number]>>;
  }

  export interface QuaggaJSConfigObject { // Renamed to avoid conflict with QuaggaConfig interface below
    inputStream?: {
      name?: string;
      
type?: 'LiveStream' | 'ImageStream' | 'VideoStream';
      target?: HTMLElement | string | null; // Can be a selector string or an element
      constraints?: MediaStreamConstraints; // From lib.dom.d.ts
      area?: {
        top?: string;    // e.g., "0%"
        right?: string;  // e.g., "0%"
        left?: string;   // e.g., "0%"
        bottom?: string; // e.g., "0%"
      };
      singleChannel?: boolean;
      size?: number; // Only for ImageStream, 640, 800, 1280, 1600, 1920, 2592
      src?: string; // For VideoStream
    };
    numOfWorkers?: number; // 0 for auto based on cores
    locate?: boolean;
    frequency?: number; // Scans per second
    decoder?: {
      readers?: Array<string | { format: string, config: any }>; // e.g., 'code_128_reader'
      debug?: {
        drawBoundingBox?: boolean;
        showFrequency?: boolean;
        drawScanline?: boolean;
        showPattern?: boolean;
      };
      multiple?: boolean;
    };
    locator?: {
      halfSample?: boolean;
      patchSize?: 'x-small' | 'small' | 'medium' | 'large' | 'x-large';
      debug?: {
        showCanvas?: boolean;
        showPatches?: boolean;
        showFoundPatches?: boolean;
        showSkeleton?: boolean;
        showLabels?: boolean;
        showPatchLabels?: boolean;
        showRemainingPatchLabels?: boolean;
        boxFromPatches?: {
          showTransformed?: boolean;
          showTransformedBox?: boolean;
          showBB?: boolean;
        };
      };
    };
  }

  // Alias for consistency with your code
  export type QuaggaConfig = QuaggaJSConfigObject;

  interface QuaggaStatic {
    init(config: QuaggaJSConfigObject, callback?: (err: any) => void): void;
    start(): void;
    stop(): void;
    onDetected(callback: (result: QuaggaDetectionResult) => void): void; // Corrected typo
    offDetected(callback?: (result: QuaggaDetectionResult) => void): void; // Corrected typo
    onProcessed(callback: (result: any) => void): void; // result can be complex
    offProcessed(callback?: (result: any) => void): void;
    canvas: {
      ctx: {
        image: CanvasRenderingContext2D | null;
        overlay: CanvasRenderingContext2D | null;
      };
      dom: {
        image: HTMLCanvasElement | null;
        overlay: HTMLCanvasElement | null;
      };
    };
    ImageDebug: {
      drawPath(path: any, style: any, context: CanvasRenderingContext2D, options: any): void;
    };
    initialized?: boolean; // Add this if you check it, though it's not officially documented
                                 // It's safer to manage init state yourself.
  }

  const Quagga: QuaggaStatic;
  export default Quagga;
}
