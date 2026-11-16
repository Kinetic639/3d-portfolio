/** Editor command envelope; execution is not implemented in the foundation. */
export interface EditorCommand {
  readonly type: "rename-world";
  readonly title: string;
}
