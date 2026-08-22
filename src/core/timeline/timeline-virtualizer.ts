export type TimelineVirtualItem={height:number};
export type TimelineVirtualWindow={start:number;end:number;top:number;bottom:number;total:number};

export class TimelineVirtualizer{
  private offsets:number[]=[0];
  private totalHeight=0;

  setItems(items:readonly TimelineVirtualItem[]):void{
    const offsets=new Array<number>(items.length+1);offsets[0]=0;
    for(let index=0;index<items.length;index++)offsets[index+1]=offsets[index]!+Math.max(1,items[index]?.height??1);
    this.offsets=offsets;this.totalHeight=offsets.at(-1)??0;
  }

  window(scrollTop:number,viewportHeight:number,overscanPx=240):TimelineVirtualWindow{
    const count=Math.max(0,this.offsets.length-1),top=Math.max(0,scrollTop-overscanPx),bottom=Math.max(top,scrollTop+Math.max(0,viewportHeight)+overscanPx);
    const start=Math.max(0,Math.min(count,this.findIndex(top))),end=Math.max(start,Math.min(count,this.findIndex(bottom)+1));
    return{start,end,top:this.offsets[start]??0,bottom:Math.max(0,this.totalHeight-(this.offsets[end]??this.totalHeight)),total:this.totalHeight};
  }

  private findIndex(offset:number):number{
    let low=0,high=Math.max(0,this.offsets.length-2);
    while(low<high){const mid=Math.floor((low+high+1)/2);if((this.offsets[mid]??0)<=offset)low=mid;else high=mid-1;}
    return low;
  }
}
