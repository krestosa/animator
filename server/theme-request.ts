export const PREVIEW_COLOR_SCHEME_RESET_PARAM='__animator_color_scheme_reset';

export function stripPreviewThemeReset(url:string):{path:string;reset:boolean}{
  const parsed=new URL(url||'/','http://preview.local');
  const reset=parsed.searchParams.get(PREVIEW_COLOR_SCHEME_RESET_PARAM)==='1';
  parsed.searchParams.delete(PREVIEW_COLOR_SCHEME_RESET_PARAM);
  return{path:parsed.pathname+(parsed.search?parsed.search:'')+(parsed.hash?parsed.hash:''),reset};
}
