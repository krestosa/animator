export {};

declare global {
  interface Window {
    animatorDesktop?: {
      blink: {
        open:(url:string)=>Promise<void>;
        close:()=>Promise<void>;
        setInstrumentation:(enabled:boolean)=>Promise<{enabled:boolean}>;
        resources:()=>Promise<Array<{url:string;initiatorType:string;resourceType:string;transferSize:number;decodedBodySize:number;mimeType:string;statusCode:number;method:string;fromCache:boolean;timestamp:number}>>;
        setViewport:(viewport:{x:number;y:number;width:number;height:number;zoomFactor:number})=>void;
        command:(command:unknown)=>void;
        onMessage:(handler:(message:unknown)=>void)=>void;
        offMessage:(handler:(message:unknown)=>void)=>void;
      };
    };
  }
}
