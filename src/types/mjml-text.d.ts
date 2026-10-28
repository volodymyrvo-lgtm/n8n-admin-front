/** `.mjml` files can be imported as text (the `loader` option in angular.json) - used by the template tests. */
declare module '*.mjml' {
  const source: string;
  export default source;
}
