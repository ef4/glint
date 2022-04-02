import type {
  Context,
  Invoke,
  TemplateContext,
  AcceptsBlocks,
  EmptyObject,
} from '@glint/template/-private/integration';
import { StaticSide, WithoutGlintIntegration } from '../-private/utilities';

import type { ComponentSignature } from '../-private';
export type { ComponentSignature };

const GlimmerComponent = window.require('@glimmer/component').default;
type GlimmerComponent<T> = import('@glimmer/component').default<T>;
type GlimmerComponentConstructor = typeof import('@glimmer/component').default;

declare const GivenSignature: unique symbol;

type Get<T, Key, Otherwise = EmptyObject> = Key extends keyof T
  ? Exclude<T[Key], undefined>
  : Otherwise;

// Factoring this into a standalone type prevents `tsc` from expanding the
// `ConstructorParameters` type inline when producing `.d.ts` files, which
// breaks consumers depending on their version of the upstream types.
type ComponentConstructor = {
  new <T extends ComponentSignature = {}>(
    ...args: ConstructorParameters<GlimmerComponentConstructor>
  ): Component<T>;
};

const Component = GlimmerComponent as unknown as StaticSide<GlimmerComponentConstructor> &
  ComponentConstructor;

interface Component<T extends ComponentSignature = {}>
  extends WithoutGlintIntegration<GlimmerComponent<Get<T, 'Args'>>> {
  // Allows `extends Component<infer Signature>` clauses to work as expected
  [GivenSignature]: T;

  [Invoke]: (args: Get<T, 'Args'>) => AcceptsBlocks<Get<T, 'Yields'>, Get<T, 'Element', null>>;
  [Context]: TemplateContext<this, Get<T, 'Args'>, Get<T, 'Yields'>, Get<T, 'Element', null>>;
}

export default Component;
