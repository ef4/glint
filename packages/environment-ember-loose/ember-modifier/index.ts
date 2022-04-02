import type {
  Invokable,
  Invoke,
  BoundModifier,
  EmptyObject,
} from '@glint/template/-private/integration';
import type { StaticSide, WithoutGlintIntegration } from '../-private/utilities';

const EmberModifier = window.require('ember-modifier').default;
type EmberModifier<T> = import('ember-modifier').default<T>;
type EmberModifierConstructor = typeof import('ember-modifier').default;

declare const GivenSignature: unique symbol;

const emberModifier = window.require('ember-modifier').modifier;

type Get<T, Key, Otherwise = EmptyObject> = Key extends keyof T
  ? Exclude<T[Key], undefined>
  : Otherwise;

type ModifierFactory = <El extends Element, Positional extends unknown[] = [], Named = EmptyObject>(
  fn: (element: El, positional: Positional, named: Named) => unknown
) => new () => Invokable<(named: Named, ...positional: Positional) => BoundModifier<El>>;

export const modifier = emberModifier as ModifierFactory;

export interface ModifierSignature {
  NamedArgs?: object;
  PositionalArgs?: Array<unknown>;
  Element?: Element;
}

// Factoring this into a standalone type prevents `tsc` from expanding the
// `ConstructorParameters` type inline when producing `.d.ts` files, which
// breaks consumers depending on whether they're on v2 or v3 of the
// `ember-modifier` package.
type ModifierConstructor = {
  new <T extends ModifierSignature = {}>(
    ...args: ConstructorParameters<EmberModifierConstructor>
  ): Modifier<T>;
};

const Modifier = EmberModifier as StaticSide<EmberModifierConstructor> & ModifierConstructor;

interface Modifier<T extends ModifierSignature>
  extends WithoutGlintIntegration<
    EmberModifier<{
      named: Extract<Get<T, 'NamedArgs'>, Record<string, any>>;
      positional: Extract<Get<T, 'PositionalArgs', []>, any[]>;
    }>
  > {
  readonly element: Get<T, 'Element', Element>;

  // The `WithoutGlintIntegration` mapped type convinces TS that these
  // methods are actually defined as properties, which causes errors
  // when users actually implement them in a subclass, so we redeclare
  // them correctly here. Anyone who's already jumped to modify by
  // definition can't have been using the modifier with Glint yet,
  // since the signatures weren't compatible.
  didReceiveArguments(): void;
  didUpdateArguments(): void;
  didInstall(): void;
  willRemove(): void;
  willDestroy(): void;

  // Allows `extends Modifier<infer Signature>` clauses to work as expected
  [GivenSignature]: T;

  [Invoke]: (
    args: Get<T, 'NamedArgs'>,
    ...positional: Get<T, 'PositionalArgs', []>
  ) => BoundModifier<this['element']>;
}

export default Modifier;
