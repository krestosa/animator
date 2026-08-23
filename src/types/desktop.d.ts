export {};

declare global {
  interface Window {
    animatorDesktop?: {
      blink: {
        open:(url:string)=>Promise<void>;
        close:()=>Promise<void>;
        resources:()=>Promise<Array<{url:string;initiatorType:string;transferSize:number;decodedBodySize:number}>>;
        setViewport:(viewport:{x:number;y:number;width:number;height:number;zoomFactor:number})=>void;
        command:(command:unknown)=>void;
        onMessage:(handler:(message:unknown)=>void)=>void;
        offMessage:(handler:(message:unknown)=>void)=>void;
      };
    };
  }
}
