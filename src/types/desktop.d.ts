export {};

type DesktopBlinkResource={url:string;initiatorType:string;resourceType:string;transferSize:number;decodedBodySize:number;mimeType:string;statusCode:number;method:string;fromCache:boolean;timestamp:number};

declare global {
  interface Window {
    animatorDesktop?: {
      blink: {
        open:(url:string)=>Promise<void>;
        close:()=>Promise<void>;
        setInstrumentation:(enabled:boolean)=>Promise<{enabled:boolean}>;
        resources:()=>Promise<DesktopBlinkResource[]>;
        openResource:(url:string)=>Promise<void>;
        closeResource:()=>Promise<void>;
        downloadResource:(url:string,name?:string)=>Promise<{saved:boolean;path?:string}>;
        onResource:(handler:(resource:DesktopBlinkResource)=>void)=>void;
        offResource:(handler:(resource:DesktopBlinkResource)=>void)=>void;
        setViewport:(viewport:{x:number;y:number;width:number;height:number;zoomFactor:number})=>void;
        setVisible:(visible:boolean)=>void;
        command:(command:unknown)=>void;
        onMessage:(handler:(message:unknown)=>void)=>void;
        offMessage:(handler:(message:unknown)=>void)=>void;
      };
    };
  }
}
