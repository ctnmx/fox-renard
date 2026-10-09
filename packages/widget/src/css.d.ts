// esbuild's text loader turns a stylesheet into its source string.
declare module "*.css" {
  const css: string;
  export default css;
}
