import { Ember } from './-ember';
import type {
  Context,
  Invoke,
  TemplateContext,
  AcceptsBlocks,
  EmptyObject,
} from '@glint/template/-private/integration';

import type { StaticSide, WithoutGlintIntegration } from '../-private/utilities';
import type { ComponentSignature } from '../-private';

export type { ComponentSignature };

declare const GivenSignature: unique symbol;

type EmberComponent = import('@ember/component').default;
type EmberComponentConstructor = typeof import('@ember/component').default;

const EmberComponent: EmberComponentConstructor = Ember.Component;

type Get<T, Key, Otherwise = EmptyObject> = Key extends keyof T
  ? Exclude<T[Key], undefined>
  : Otherwise;

export type ArgsFor<T extends ComponentSignature> = 'Args' extends keyof T ? T['Args'] : {};

// Factoring this into a standalone type prevents `tsc` from expanding the
// `ConstructorParameters` type inline when producing `.d.ts` files, which
// breaks consumers depending on their version of the upstream types.
type ComponentConstructor = {
  new <T extends ComponentSignature = {}>(
    ...args: ConstructorParameters<EmberComponentConstructor>
  ): Component<T>;
};

const Component = EmberComponent as unknown as StaticSide<typeof EmberComponent> &
  ComponentConstructor;

interface Component<T extends ComponentSignature = {}>
  extends WithoutGlintIntegration<EmberComponent> {
  // Allows `extends Component<infer Signature>` clauses to work as expected
  [GivenSignature]: T;

  [Context]: TemplateContext<this, Get<T, 'Args'>, Get<T, 'Yields'>, Get<T, 'Element', null>>;
  [Invoke]: (
    args: Get<T, 'Args'>,
    ...positional: Get<T, 'PositionalArgs', []>
  ) => AcceptsBlocks<Get<T, 'Yields'>, Get<T, 'Element', null>>;
}

export default Component;
