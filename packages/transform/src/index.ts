import path from 'path';
import type ts from 'typescript';
import { GlintEnvironment } from '@glint/config';
import { assert, createSyntheticSourceFile, TSLib } from './util';
import TransformedModule, {
  CorrelatedSpan,
  TransformError,
  SourceFile,
  Directive,
  Range,
} from './transformed-module';
import { CorrelatedSpansResult, PartialCorrelatedSpan } from './inlining';
import { calculateTaggedTemplateSpans } from './inlining/tagged-strings';
import { calculateCompanionTemplateSpans } from './inlining/companion-file';
import { GlintEmitMetadata } from '@glint/config/src/environment';

export { TransformedModule, Directive, Range, SourceFile };

/**
 * Given a TypeScript diagnostic object from a module that was rewritten
 * by `rewriteModule`, as well as the resulting `TransformedModule`, returns
 * a rewritten version of that diagnostic that maps to the corresponding
 * location in the original source file.
 */
export function rewriteDiagnostic<
  T extends ts.DiagnosticWithLocation | ts.DiagnosticRelatedInformation
>(
  ts: TSLib,
  transformedDiagnostic: T,
  locateTransformedModule: (fileName: string) => TransformedModule | null | undefined
): T {
  assert(transformedDiagnostic.file);
  assert(transformedDiagnostic.start);
  assert(transformedDiagnostic.length);

  let transformedModule = locateTransformedModule(transformedDiagnostic.file.fileName);
  if (!transformedModule) {
    return transformedDiagnostic;
  }

  let { start, end, source } = transformedModule.getOriginalRange(
    transformedDiagnostic.start,
    transformedDiagnostic.start + transformedDiagnostic.length
  );

  let length = end - start;
  let diagnostic: T = {
    // This cast is safe (it's the declared parameter type), but needed as of 4.3.0-dev.20210322
    ...(transformedDiagnostic as T),
    start,
    length,
    file: createSyntheticSourceFile(ts, source),
  };

  if (hasRelatedInformation(diagnostic) && diagnostic.relatedInformation) {
    diagnostic.relatedInformation = diagnostic.relatedInformation.map((relatedInfo) =>
      rewriteDiagnostic(ts, relatedInfo, locateTransformedModule)
    );
  }

  return diagnostic;
}

export type Diagnostic = ts.Diagnostic & { isGlintTransformDiagnostic?: boolean };

export function createTransformDiagnostic(
  ts: TSLib,
  source: SourceFile,
  message: string,
  location: Range
): Diagnostic {
  return {
    isGlintTransformDiagnostic: true,
    category: ts.DiagnosticCategory.Error,
    code: 0,
    file: createSyntheticSourceFile(ts, source),
    start: location.start,
    length: location.end - location.start,
    messageText: message,
  };
}

function hasRelatedInformation(
  value: ts.DiagnosticWithLocation | ts.DiagnosticRelatedInformation
): value is ts.DiagnosticWithLocation {
  return 'relatedInformation' in value && Boolean(value.relatedInformation);
}

/**
 * Input to the process of rewriting a template, containing one or both of:
 *   script: the backing JS/TS module for a component, which may contain
 *           embedded templates depending on the environment
 *   template: a standalone template file
 */
export type RewriteInput = { script: SourceFile; template?: SourceFile };

/**
 * Given the script and/or template that together comprise a component module,
 * returns a `TransformedModule` representing the combined result, with the
 * template(s), either alongside or inline, rewritten into equivalent TypeScript
 * in terms of the active glint environment's exported types.
 *
 * May return `null` if an unrecoverable parse error occurs or if there is
 * no transformation to be done.
 */
export function rewriteModule(
  ts: TSLib,
  { script, template }: RewriteInput,
  environment: GlintEnvironment
): TransformedModule | null {
  let { errors, directives, partialSpans } = calculateCorrelatedSpans(
    ts,
    script,
    template,
    environment
  );

  if (!partialSpans.length && !errors.length) {
    return null;
  }

  let sparseSpans = completeCorrelatedSpans(partialSpans);
  let { contents, correlatedSpans } = calculateTransformedSource(script, sparseSpans);

  return new TransformedModule(contents, errors, directives, correlatedSpans);
}

/**
 * Locates any embedded templates in the given AST and returns a corresponding
 * `PartialReplacedSpan` for each, as well as any errors encountered. These
 * spans are then used in `rewriteModule` above to calculate the full set of
 * source-to-source location information as well as the final transformed source
 * string.
 */
function calculateCorrelatedSpans(
  ts: TSLib,
  script: SourceFile,
  template: SourceFile | undefined,
  environment: GlintEnvironment
): CorrelatedSpansResult {
  let directives: Array<Directive> = [];
  let errors: Array<TransformError> = [];
  let partialSpans: Array<PartialCorrelatedSpan> = [];

  let { ast, emitMetadata } = parseScript(ts, script, environment);

  ts.transform(ast, [
    (context) =>
      function visit<T extends ts.Node>(node: T): T {
        if (ts.isTaggedTemplateExpression(node)) {
          let meta = emitMetadata.get(node);
          let result = calculateTaggedTemplateSpans(ts, node, meta, script, environment);

          directives.push(...result.directives);
          errors.push(...result.errors);
          partialSpans.push(...result.partialSpans);
        } else if (ts.isModuleDeclaration(node)) {
          // don't traverse into declare module
          return node;
        }

        return ts.visitEachChild(node, visit, context);
      },
  ]);

  if (template) {
    let result = calculateCompanionTemplateSpans(ts, ast, script, template, environment);

    directives.push(...result.directives);
    errors.push(...result.errors);
    partialSpans.push(...result.partialSpans);
  }

  return { errors, directives, partialSpans };
}

type ParseResult = {
  ast: ts.SourceFile;
  emitMetadata: WeakMap<ts.Node, GlintEmitMetadata>;
};

function parseScript(ts: TSLib, script: SourceFile, environment: GlintEnvironment): ParseResult {
  let { filename, contents } = script;
  let extension = path.extname(filename);
  let emitMetadata = new WeakMap<ts.Node, GlintEmitMetadata>();
  let setEmitMetadata = (node: ts.Node, data: GlintEmitMetadata): void =>
    void emitMetadata.set(node, data);

  let { preprocess, transform } = environment.getConfigForExtension(extension) ?? {};
  let preprocessed = preprocess?.(contents, filename) ?? { contents };
  let ast = ts.createSourceFile(
    filename,
    preprocessed.contents,
    ts.ScriptTarget.Latest,
    true // setParentNodes
  );

  if (transform) {
    let { transformed } = ts.transform(ast, [
      (context) => transform!(preprocessed.data, { ts, context, setEmitMetadata }),
    ]);

    assert(transformed.length === 1 && ts.isSourceFile(transformed[0]));
    ast = transformed[0];
  }

  return { ast, emitMetadata };
}

/**
 * Given a sparse `CorrelatedSpan` array and the original source for a module,
 * returns the resulting full transformed source string for that module, as
 * well as a filled-in array of correlated spans that includes chunks of the
 * original source that were not transformed.
 */
function calculateTransformedSource(
  originalFile: SourceFile,
  sparseSpans: Array<CorrelatedSpan>
): { contents: string; correlatedSpans: Array<CorrelatedSpan> } {
  let correlatedSpans: Array<CorrelatedSpan> = [];
  let originalOffset = 0;
  let transformedOffset = 0;

  for (let span of sparseSpans) {
    let interstitial = originalFile.contents.slice(originalOffset, span.insertionPoint);

    if (interstitial.length) {
      correlatedSpans.push({
        originalFile,
        originalStart: originalOffset,
        originalLength: interstitial.length,
        insertionPoint: originalOffset,
        transformedStart: transformedOffset,
        transformedLength: interstitial.length,
        transformedSource: interstitial,
      });
    }

    correlatedSpans.push(span);

    transformedOffset += interstitial.length + span.transformedLength;
    originalOffset +=
      interstitial.length + (span.originalFile === originalFile ? span.originalLength : 0);
  }

  let trailingContent = originalFile.contents.slice(originalOffset);

  correlatedSpans.push({
    originalFile,
    originalStart: originalOffset,
    originalLength: trailingContent.length + 1,
    insertionPoint: originalOffset,
    transformedStart: transformedOffset,
    transformedLength: trailingContent.length + 1,
    transformedSource: trailingContent,
  });

  return {
    contents: correlatedSpans.map((span) => span.transformedSource).join(''),
    correlatedSpans,
  };
}

/**
 * Given an array of `PartialCorrelatedSpan`s for a file, calculates
 * their `transformedLength` and `transformedStart` values, resulting
 * in full `ReplacedSpan`s.
 */
function completeCorrelatedSpans(
  partialSpans: Array<PartialCorrelatedSpan>
): Array<CorrelatedSpan> {
  let replacedSpans: Array<CorrelatedSpan> = [];

  for (let i = 0; i < partialSpans.length; i++) {
    let current = partialSpans[i];
    let transformedLength = current.transformedSource.length;
    let transformedStart = current.insertionPoint;
    if (i > 0) {
      let previous = replacedSpans[i - 1];
      transformedStart =
        previous.transformedStart +
        previous.transformedSource.length +
        (current.insertionPoint - previous.insertionPoint - previous.originalLength);
    }

    replacedSpans.push({ ...current, transformedStart, transformedLength });
  }

  return replacedSpans;
}
