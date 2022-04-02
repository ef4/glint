// This module is responsible for augmenting the upstream definitions of what a component,
// helper, or modifier is to include the information necessary for Glint to typecheck them.

// Import all the modules we're augmenting to make sure we don't short-circuit resolution
// and make ONLY our augmentations resolve.
import '@ember/component';
import '@ember/component/template-only';
import '@ember/component/helper';
import '@glimmer/component';
import 'ember-modifier/-private/class/modifier';
import 'ember-modifier/-private/function-based/modifier';

// Grab signature utilities for each entity type from their respective locations.
import * as C from '@glimmer/component/dist/types/addon/-private/component';
import * as H from '@ember/component/helper';
import * as M from 'ember-modifier/-private/signature';

import {
  Invoke,
  InvokeDirect,
  Context,
  TemplateContext,
  AcceptsBlocks,
  BoundModifier,
  OpaqueInvokable,
} from '@glint/template/-private/integration';

type EnsureSpreadable<T, Otherwise = []> = T extends Array<unknown> ? T : Otherwise;
type EnsureElement<T, Otherwise = null> = T extends Element ? T : Otherwise;

// This is a workaround for the fact that @glimmer/component initially shipped
// with a bug that causes blocks to expand as `{ default: { Positional: [] } }` rather
// thatn `{ default: { Params: { Positional: [] } } }`. Once a fix is released,
// we can require at least that version starting in Glint 0.8 and drop this wrapper.
type MaybeBlockParams<T> = T | { Params: T };

type FlattenBlockParams<T> = {
  [K in keyof T]: T[K] extends MaybeBlockParams<{ Positional: infer U }> ? U : T[K];
};

declare module '@ember/component' {
  export default interface Component<S> {
    [Invoke]: (
      named: C.ExpandSignature<S>['Args']['Named'],
      ...positional: C.ExpandSignature<S>['Args']['Positional']
    ) => AcceptsBlocks<
      FlattenBlockParams<C.ExpandSignature<S>['Blocks']>,
      EnsureElement<C.ExpandSignature<S>['Element']>
    >;

    [Context]: TemplateContext<
      this,
      C.ExpandSignature<S>['Args']['Named'],
      FlattenBlockParams<C.ExpandSignature<S>['Blocks']>,
      C.ExpandSignature<S>['Element']
    >;
  }
}

declare module '@ember/component/template-only' {
  export interface TemplateOnlyComponent<S> {
    new (): {
      [Invoke]: (
        named: C.ExpandSignature<S>['Args']['Named'],
        ...positional: C.ExpandSignature<S>['Args']['Positional']
      ) => AcceptsBlocks<
        FlattenBlockParams<C.ExpandSignature<S>['Blocks']>,
        EnsureElement<C.ExpandSignature<S>['Element']>
      >;

      [Context]: TemplateContext<
        void,
        C.ExpandSignature<S>['Args']['Named'],
        FlattenBlockParams<C.ExpandSignature<S>['Blocks']>,
        C.ExpandSignature<S>['Element']
      >;
    };
  }
}

declare module '@ember/component/helper' {
  export default interface Helper<S> {
    [Invoke]: (
      named: H.ExpandSignature<S>['Args']['Named'],
      ...positional: EnsureSpreadable<H.ExpandSignature<S>['Args']['Positional']>
    ) => H.ExpandSignature<S>['Return'];
  }

  // This additional signature allows for functions with type parameters to have
  // those type params preserved in the resulting helper. Without this, code like
  // `helper(<T>([x]: [T]) => x)` would fail to typecheck.
  export function helper<P extends unknown[], N = EmptyObject, R = unknown>(
    f: (positional: P, named: N) => R
  ): OpaqueInvokable<(named: N, ...positional: P) => R>;

  export interface FunctionBasedHelper<S> {
    [InvokeDirect]: (
      named: H.ExpandSignature<S>['Args']['Named'],
      ...positional: EnsureSpreadable<H.ExpandSignature<S>['Args']['Positional']>
    ) => H.ExpandSignature<S>['Return'];
  }
}

declare module '@glimmer/component' {
  export default interface Component<S> {
    [Invoke]: (
      named: C.ExpandSignature<S>['Args']['Named'],
      ...positional: C.ExpandSignature<S>['Args']['Positional']
    ) => AcceptsBlocks<
      FlattenBlockParams<C.ExpandSignature<S>['Blocks']>,
      EnsureElement<C.ExpandSignature<S>['Element']>
    >;

    [Context]: TemplateContext<
      this,
      C.ExpandSignature<S>['Args']['Named'],
      FlattenBlockParams<C.ExpandSignature<S>['Blocks']>,
      C.ExpandSignature<S>['Element']
    >;
  }
}

declare module 'ember-modifier/-private/class/modifier' {
  export default interface ClassBasedModifier<S> {
    [Invoke]: (
      named: M.NamedArgs<S>,
      ...positional: EnsureSpreadable<M.PositionalArgs<S>>
    ) => BoundModifier<EnsureElement<M.ElementFor<S>, never>>;
  }
}

declare module 'ember-modifier/-private/function-based/modifier' {
  export interface FunctionBasedModifier<S> {
    [InvokeDirect]: (
      named: M.NamedArgs<S>,
      ...positional: EnsureSpreadable<M.PositionalArgs<S>>
    ) => BoundModifier<EnsureElement<M.ElementFor<S>, never>>;
  }
}
