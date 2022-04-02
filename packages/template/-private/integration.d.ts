// While the entire `@glint/template` package is currently private, this
// module exports the symbols and types necessary to declare a class or
// other entity as integrating with Glint's template system.

/** Any function, which is the tighest bound we can put on an object's `[Invoke]` field. */
export type AnyFunction = (...params: any) => any;

/** Any type loosely fitting the shape of a template context */
export type AnyContext = TemplateContext<any, any, any, any>;

/** The loosest shape of a "blocks hash" */
export type AnyBlocks = Partial<Record<string, any[]>>;

export declare const InvokeDirect: unique symbol;
export type DirectInvokable<T extends AnyFunction = AnyFunction> = { [InvokeDirect]: T };

export declare const Invoke: unique symbol;
export type Invokable<T extends AnyFunction = AnyFunction> = { [Invoke]: T };
export type OpaqueInvokable<T extends AnyFunction = AnyFunction> = new (key: never) => Invokable<T>;

export declare const Context: unique symbol;
export type HasContext<T extends AnyContext = AnyContext> = { [Context]: T };

// These shenanigans are necessary to get TS to report when named args
// are passed to a signature that doesn't expect any, because `{}` is
// special-cased in the type system not to trigger EPC.
declare const EmptyObject: unique symbol;
export type EmptyObject = { [EmptyObject]?: void };

declare const Element: unique symbol;
declare const Modifier: unique symbol;
declare const Blocks: unique symbol;

/** Denotes a modifier whose arguments have been bound and is ready to be attached to an element. */
export type BoundModifier<El extends Element> = { [Modifier]: (el: El) => void };

/**
 * Denotes that the associated entity may be invoked with the given
 * blocks, yielding params of the appropriate type.
 */
export type AcceptsBlocks<BlockImpls, El extends Element | null = null> = {
  [Element]: El;
  (blocks: BlockImpls): { [Blocks]: true };
};

/**
 * Determines the type of `this` and any `@arg`s used in a template,
 * as well as valid `{{yield}}` invocations and `...attributes` usage.
 */
export type TemplateContext<This, Args, Yields, Element> = {
  this: This;
  args: Args;
  yields: Yields;
  element: Element;
};
