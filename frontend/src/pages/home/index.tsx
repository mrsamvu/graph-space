import React, { createElement, useCallback, useEffect, useRef, useState } from 'react';
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { BiCaretRight, BiCollection } from "react-icons/bi";
import { RxFileText } from "react-icons/rx";
import { CiCloudOn } from "react-icons/ci";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ArrowRight, Check, ChevronDown, ChevronRight, Copy, Search } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { setEndpoint } from './redux/slices/home.slice';
import { RootState } from '@/redux/store';
import {
  buildClientSchema,
  getIntrospectionQuery,
  GraphQLSchema,
  parse,
  validate,
  GraphQLError,
  IntrospectionQuery,
  GraphQLArgument,
  FieldNode,
  OperationDefinitionNode,
  GraphQLField,
  isNonNullType,
  isListType,
  isNamedType,
  isObjectType,
  isInterfaceType,
  isScalarType,
  isEnumType,
  isUnionType,
  SelectionNode,
  getNamedType,
  GraphQLNonNull,
  GraphQLType,
  GraphQLList,
  GraphQLNamedType,
  valueFromASTUntyped,
  visit,
  Kind,
  parseType,
} from "graphql";
import { graphql as graphqlMode, updateSchema } from "cm6-graphql";
import { EditorView, keymap, lineNumbers, drawSelection, rectangularSelection, crosshairCursor, Decoration, DecorationSet } from "@codemirror/view";
import { SendRequest } from "../../../wailsjs/go/services/CallAPIService";
import { Checkbox } from '../../components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { EditorState, Extension, Prec, RangeSetBuilder, StateField } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, foldService, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { renderToStaticMarkup } from "react-dom/server";
import { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import { Diagnostic, linter, lintKeymap } from '@codemirror/lint';
import { indentationMarkers } from "@replit/codemirror-indentation-markers";

import {
  findNext,
  findPrevious,
  highlightSelectionMatches,
  openSearchPanel,
  search,
  closeSearchPanel
} from "@codemirror/search";
import { print } from "graphql";

function formatTypeSig(type: any): string {
  if (!type) return "Unknown";

  if (isNonNullType(type)) {
    return `${formatTypeSig(type.ofType)}!`;
  }

  if (isListType(type)) {
    return `[${formatTypeSig(type.ofType)}]`;
  }

  if (isNamedType(type)) {
    return type.name;
  }

  return "Unknown";
}

// ======================================================
// TYPES
// ======================================================

type ExplorerField = {
  name: string;

  type: string;

  kind:
    | "object"
    | "scalar"
    | "enum"
    | "interface"
    | "union";

  nextTypeName?: string | null;

  args: {
    name: string;
    type: string;
    description?: string | null;
    rawArg?: GraphQLArgument;
  }[];

  description?: string | null;
};

type ExplorerType = {
  name: string;

  fields: ExplorerField[];
};

const Home: React.FC = () => {
  const editorDomRef = useRef<HTMLDivElement>(null);
  const variablesDomRef = useRef<HTMLDivElement>(null);
  const headersDomRef = useRef<HTMLDivElement>(null);
  const resultDomRef = useRef<HTMLDivElement>(null);
  const BiCaretRightIcon = BiCaretRight as any;
  const RxFileTextIcon = RxFileText as any;
  const BiCollectionIcon = BiCollection as any;
  const CiCloudOnIcon = CiCloudOn as any;
  const dispatch = useDispatch();
  const { lastEndpoint } = useSelector((state: RootState) => state.app);
  const [schemaStatus, setSchemaStatus] = useState<"idle" | "connected" | "error">("idle");
  const lastIntrospectionRef = useRef<string | null>(null);
  const editorViewRef = useRef<Record<string, EditorView>>({});
  const schemaRef = useRef<GraphQLSchema | null>(null);
  const [canRunOperation, setCanRunOperation] = useState(false);
  const [isRunningOperation, setIsRunningOperation] = useState(false);
  const [requestConfigTab, setRequestConfigTab] = useState<"variables" | "headers">("variables");
  const [responseCopied, setResponseCopied] = useState(false);

  const scrollRef = useRef<any>(null);

  const overlayScrollOptions = {
    scrollbars: {
      theme: "os-theme-graph-space",
      autoHide: "leave",
      autoHideDelay: 120,
      clickScroll: true,
    },
  } as const;

  const [rootOperations, setRootOperations] = useState<{
    query: boolean;
    mutation: boolean;
  }>({
    query: false,
    mutation: false,
  });

  // Load schema
  async function loadSchema() {
    try {
      // Thay fetch() bằng Go bridge
      const res = await SendRequest({
        url: lastEndpoint,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: getIntrospectionQuery() }), // ✅ dùng hàm chuẩn của graphql-js
      });

      if (res.error) {
        setSchemaStatus("error");
        return;
      }

      const json = JSON.parse(res.body);

      if (json.errors) {
        setSchemaStatus("error");
        return;
      }

      const introspectionSignature =
        JSON.stringify(json.data);

      setSchemaStatus("connected");

      if (
        lastIntrospectionRef.current ===
        introspectionSignature
      ) {
        return;
      }

      lastIntrospectionRef.current =
        introspectionSignature;

      const gqlSchema = buildClientSchema(json.data as IntrospectionQuery);
      schemaRef.current = gqlSchema;

      const explorer =
        buildExplorerSchema(
          gqlSchema
        );

      setExplorerSchema(
        explorer
      );

      // Update cm6-graphql with real schema
      const graphQLEditor =
        editorViewRef.current[
          "operation"
        ];

      if (graphQLEditor) {
        updateSchema(
          graphQLEditor,
          gqlSchema
        );
      }

      const operationView =
        editorViewRef.current[
          "operation"
        ];

      if (operationView) {
        setCanRunOperation(
          operationCanRun(operationView)
        );
      }
    } catch {
      setSchemaStatus("error");
    }
  }

  useEffect(() => {
    let disposed = false;
    let inFlight = false;

    const syncSchema = async () => {
      if (
        disposed ||
        inFlight ||
        !lastEndpoint
      ) {
        return;
      }

      inFlight = true;
      await loadSchema();
      inFlight = false;
    };

    lastIntrospectionRef.current = null;
    loadSchema();

    const intervalId =
      window.setInterval(
        syncSchema,
        5000
      );

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, [lastEndpoint]);


  const customFoldGutter = foldGutter({
    openText: "",
    closedText: "",

    markerDOM(open) {
      const marker = document.createElement("span");

      marker.style.display = "inline-flex";
      marker.style.alignItems = "center";
      marker.style.justifyContent = "center";

      marker.style.width = "23px";
      marker.style.height = "23px";

      marker.style.borderRadius = "6px";

      marker.style.cursor = "pointer";
      marker.style.userSelect = "none";

      marker.style.transition = "all 0.15s ease";

      marker.style.color = "#94a3b8";

      marker.innerHTML = renderToStaticMarkup(
        createElement(
          open
            ? ChevronDown
            : ChevronRight,
          {
            size: 20,
            strokeWidth: 2.5,
          }
        )
      );

      marker.onmouseenter = () => {
        // marker.style.background = "#ffffff10";
        // marker.style.color = "#94a3b8";
        marker.style.color = "#ffffff";
        // marker.style.transform = "scale(1.08)";
      };

      marker.onmouseleave = () => {
        // marker.style.background = "transparent";

        marker.style.color = "#94a3b8";

        // marker.style.transform = "scale(1)";
      };

      return marker;
    },
  });

  // ── Dark theme for CodeMirror ──────────────────────────────────────
  const gqlDarkTheme = EditorView.theme(
    {
      "&": {
        color: "#e2e8f0",
        backgroundColor: "#121212",
        height: "100%",
        width: "100%",
        minHeight: "0",
        overflow: "hidden",
        fontSize: "15px",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      },

      ".cm-scroller": {
        height: "100%",
        maxHeight: "100%",
        overflowY: "auto",
        overflowX: "auto",
      },

      ".cm-content": {
        caretColor: "#a1a1aa",
        padding: "12px 30px 12px 0",
        boxSizing: "border-box",
        minHeight: "100%",
      },

      ".cm-cursor": {
        borderLeftColor: "#a1a1aa",
        borderLeftWidth: "2px",
      },

      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: "#facc1520",
      },

      ".cm-gutters": {
        minWidth: "52px",
        backgroundColor: "#121212",
        color: "#4a5568",
        border: "none",
      },

      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 12px 0 8px",
        minWidth: "40px",
      },

      // active line
      ".cm-activeLine": {
        backgroundColor: "#ffffff08",
      },

      ".cm-activeLineGutter": {
        backgroundColor: "#ffffff05",
        color: "#718096",
      },

      // fold placeholder
      ".cm-foldPlaceholder": {
        backgroundColor: "#1e293b",
        border: "1px solid #334155",
        color: "#94a3b8",
        borderRadius: "6px",
        padding: "0 6px",
        fontSize: "11px",
      },

      // autocomplete
      ".cm-tooltip": {
        backgroundColor: "#161b27",
        border: "1px solid #2d3748",
        borderRadius: "4px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
      },

      ".cm-tooltip-autocomplete ul": {
        maxHeight: "240px",
      },

      ".cm-tooltip-autocomplete ul li": {
        padding: "4px 12px",
        color: "#cbd5e0",
      },

      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: "#facc1520",
        color: "#facc15",
      },

      // lint
      ".cm-lintRange-error": {
        backgroundImage: "none",
        borderBottom: "2px solid #f87171",
        textDecoration: "underline wavy #f87171",
      },

      ".cm-lintRange-warning": {
        borderBottom: "2px solid #fbbf24",
      },

      ".cm-diagnostic-error": {
        borderLeft: "3px solid #f87171",
        color: "#fca5a5",
        padding: "4px 8px",
      },

      // matching bracket
      ".cm-matchingBracket": {
        backgroundColor: "#facc1530",
        outline: "1px solid #facc1560",
      },

      // fold gutter
      ".cm-foldGutter": {
        width: "28px",
      },

      ".cm-foldGutter .cm-gutterElement": {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        height: "100%",
        padding: "0",

        opacity: 0,
        transition: "opacity 0.15s ease",
      },

      // hover gutter mới hiện nút fold
      ".cm-gutters:hover .cm-foldGutter .cm-gutterElement": {
        opacity: 1,
      },

      // scrollbar
      ".cm-scroller::-webkit-scrollbar": {
        width: "8px",
        height: "8px",
      },

      ".cm-scroller::-webkit-scrollbar-thumb": {
        background: "transparent",
        backgroundClip: "content-box",
        border: "2px solid transparent",
        borderRadius: "999px",
      },

      ".cm-scroller:hover::-webkit-scrollbar-thumb": {
        background: "linear-gradient(180deg, rgba(220, 226, 235, 0.82), rgba(137, 146, 158, 0.72))",
        backgroundClip: "content-box",
        border: "2px solid transparent",
      },

      ".cm-scroller::-webkit-scrollbar-thumb:hover": {
        background: "linear-gradient(180deg, rgba(240, 244, 248, 0.95), rgba(165, 174, 187, 0.9))",
      },

      ".cm-scroller::-webkit-scrollbar-track": {
        background: "transparent",
        borderRadius: "999px",
      },

      ".cm-scroller:hover::-webkit-scrollbar-track": {
        background: "rgba(255, 255, 255, 0.04)",
      },

      // bỏ ô vuông góc dưới phải
      ".cm-scroller::-webkit-scrollbar-corner": {
        background: "transparent",
      },

      "&.cm-focused": {
        outline: "none !important",
        border: "none !important"
      },
      ".cm-operation-active": {
        opacity: "1",
        filter: "brightness(1.18)",
        fontWeight: "600",
        transition: "filter 0.15s ease, opacity 0.15s ease",
      },

      ".cm-operation-active *": {
        opacity: "1",
      },
      ".cm-operation-inactive": {
        opacity: "0.72",
        transition: "opacity 0.15s ease",
      },

      ".cm-operation-inactive *": {
        opacity: "0.72",
      },
      ".cm-json-key": {
        color: "#7ec7a2",
      },
      ".cm-json-string": {
        color: "#feba99 !important",
      },
      ".cm-json-number": {
        color: "#feba99 !important",
      },
      ".cm-json-literal": {
        color: "#feba99 !important",
        fontWeight: "600",
      },
      ".cm-selectionMatch": {
        backgroundColor: "#facc1520",
        border: "1px solid #facc1540",
      },

      ".cm-selectionMatch-main": {
        backgroundColor: "#facc1535",
      },
      ".cm-panels": {
        backgroundColor: "#161b22",
        borderBottom: "1px solid #2d3748",
        color: "#e2e8f0",
        padding: "10px"
      },

      ".cm-search": {
        padding: "20px",
        display: "flex",
        gap: "8px",
        alignItems: "center",

        flexWrap: "wrap",
      },

      ".cm-search input": {
        background: "#0f172a",
        border: "1px solid #334155",
        color: "#e2e8f0",
        borderRadius: "6px",
        padding: "6px 10px",
        outline: "none",
      },

      ".cm-search button": {
        background: "#1e293b",
        border: "1px solid #334155",
        color: "#e2e8f0",
        borderRadius: "6px",
        padding: "4px 10px",
        cursor: "pointer",
      },

      ".cm-search button:hover": {
        background: "#334155",
      },

      ".cm-search input[type='checkbox']": {
        margin: 0,

        accentColor: "#4B9467",

        cursor: "pointer",

        transform: "scale(1.2)",
        transformOrigin: "center",

        verticalAlign: "middle",
      },

      /* close button */
      ".cm-search button[name='close']": {
        width: "32px",
        height: "32px",

        display: "flex",
        alignItems: "center",
        justifyContent: "center",

        fontSize: "20px",

        borderRadius: "8px",
      },

      ".cm-search button[name='close'] span": {
        fontSize: "22px",
        lineHeight: 1,
      },
      ".cm-search label": {
        display: "none",
      },

      ".cm-search button[name='select']": {
        display: "none",
      },
      ".cm-search input[name='replace'], \
      .cm-search button[name='replace'], \
      .cm-search button[name='replaceAll']": {
        display: "none !important",  // ← thêm !important
      },

      ".cm-search.cm-show-replace input[name='replace'], \
      .cm-search.cm-show-replace button[name='replace'], \
      .cm-search.cm-show-replace button[name='replaceAll']": {
        display: "flex !important",  // ← thêm !important
      },
      ".cm-search.cm-show-replace input[name='search']": {
        display: "none !important",
      },
      ".cm-search.cm-show-replace button[name='next']": {
        display: "none !important",
      },
      ".cm-search.cm-show-replace button[name='prev']": {
        display: "none !important",
      },
      ".cm-search.cm-show-replace button[name='select']": {
        display: "none !important",
      },
      // Hiện replace inputs
      ".cm-search.cm-show-replace input[name='replace']": {
        display: "flex !important",
      },
      ".cm-search.cm-show-replace button[name='replace']": {
        display: "flex !important",
      },
      ".cm-search.cm-show-replace button[name='replaceAll']": {
        display: "flex !important",
      },
      ".cm-search.cm-show-replace .cm-textfield:first-of-type": {
        display: "none !important",
      },
      ".cm-searchMatch": {
        backgroundColor: "#facc1530",
        outline: "1px solid #facc1540",
      },

      ".cm-searchMatch-selected": {
        backgroundColor: "#facc1570",
        outline: "1px solid #facc15a0",
      }
    },
    { dark: true }
  );

  // GraphQL syntax token colors
  const gqlHighlight = syntaxHighlighting(
    HighlightStyle.define([
      // query / mutation
      {
        tag: t.keyword,
        color: "#e06c75",
        fontWeight: "600",
      },

      // variables
      {
        tag: t.variableName,
        color: "#56b6c2",
      },

      // types
      {
        tag: [t.typeName, t.className],
        color: "#d19a66",
        fontWeight: "600",
      },

      // fields
      {
        tag: t.propertyName,
        color: "#7ec7a2",
      },

      // args
      {
        tag: t.attributeName,
        color: "#c678dd",
      },

      // strings
      {
        tag: t.string,
        color: "#98c379",
      },

      // numbers
      {
        tag: t.number,
        color: "#d19a66",
      },

      // booleans
      {
        tag: t.bool,
        color: "#be5046",
        fontWeight: "600",
      },

      // null
      {
        tag: t.null,
        color: "#5c6370",
        fontStyle: "italic",
      },

      // comments
      {
        tag: t.comment,
        color: "#4b5263",
        fontStyle: "italic",
      },

      // punctuation
      {
        tag: [t.bracket, t.paren],
        color: "#6b7280",
      },

      // operators
      {
        tag: t.operator,
        color: "#56b6c2",
      },
    ])
  );

  // ── Build GraphQL linter using schema ──────────────────────────────
  const buildLinter = useCallback((): Extension => {
    return linter((view) => {
      const schema = schemaRef.current;
      const diagnostics: Diagnostic[] = [];
      const docText = view.state.doc.toString();
      if (!docText || !schema) return diagnostics;

      const positionFromLocation = (
        source: string,
        loc: { line: number; column: number },
        offset: number
      ) => {
        let pos = 0;
        const lines = source.split("\n");

        for (
          let i = 0;
          i < loc.line - 1 &&
          i < lines.length;
          i++
        ) {
          pos += lines[i].length + 1;
        }

        pos += (loc.column ?? 1) - 1;
        return offset + pos;
      };

      const addDiagnosticsForSource = (
        source: string,
        offset: number
      ) => {
        try {
          const ast = parse(source);
          const errors: readonly GraphQLError[] = validate(schema, ast);

          for (const err of errors) {
            const loc = err.locations?.[0];
            if (!loc) continue;

            const pos =
              positionFromLocation(
                source,
                loc,
                offset
              );

            const end =
              Math.min(
                pos +
                  (err.message.match(/\"([^\"]+)\"/)?.[1]?.length ?? 5),
                offset + source.length
              );

            diagnostics.push({
              from: pos,
              to: end,
              severity: "error",
              message: err.message,
            });
          }
        } catch (parseErr: any) {
          const loc = parseErr?.locations?.[0];

          if (loc) {
            const pos =
              positionFromLocation(
                source,
                loc,
                offset
              );

            diagnostics.push({
              from: pos,
              to: Math.min(
                pos + 1,
                offset + source.length
              ),
              severity: "error",
              message: parseErr.message,
            });
          }
        }
      };

      const ranges =
        getOperationRangesFromText(
          docText
        );

      if (ranges.length === 0) {
        addDiagnosticsForSource(
          docText,
          0
        );
        return diagnostics;
      }

      ranges.forEach((range) => {
        addDiagnosticsForSource(
          docText.slice(
            range.start,
            range.end
          ),
          range.start
        );
      });

      return diagnostics;
    });
  }, []);

  // ope không có con trỏ chuột thì nhạt màu hơn
  const inactiveOperationField = StateField.define<DecorationSet>({
    create(state) {
      return buildInactiveDecorations(state);
    },

    update(deco, tr) {
      if (
        tr.docChanged ||
        tr.selection
      ) {
        return buildInactiveDecorations(tr.state);
      }

      return deco.map(tr.changes);
    },

    provide: (f) =>
      EditorView.decorations.from(f),
  });

  const jsonKeyDecoration =
    Decoration.mark({
      class: "cm-json-key",
    });

  const jsonStringDecoration =
    Decoration.mark({
      class: "cm-json-string",
    });

  const jsonNumberDecoration =
    Decoration.mark({
      class: "cm-json-number",
    });

  const jsonLiteralDecoration =
    Decoration.mark({
      class: "cm-json-literal",
    });

  function buildJsonDecorations(
    state: EditorState
  ) {
    const builder =
      new RangeSetBuilder<Decoration>();

    const doc =
      state.doc.toString();

    const tokenRegex =
      /"(?:\\.|[^"\\])*"(?=\s*:)|"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;

    let match:
      | RegExpExecArray
      | null;

    while (
      (match = tokenRegex.exec(doc))
    ) {
      const token =
        match[0];

      const decoration =
        token.startsWith('"')
          ? /^\s*:/.test(
            doc.slice(
              match.index + token.length,
              match.index + token.length + 32
            )
          )
            ? jsonKeyDecoration
            : jsonStringDecoration
          : /^(true|false|null)$/.test(token)
            ? jsonLiteralDecoration
            : jsonNumberDecoration;

      builder.add(
        match.index,
        match.index + token.length,
        decoration
      );
    }

    return builder.finish();
  }

  const jsonHighlightField =
    StateField.define<DecorationSet>({
      create(state) {
        return buildJsonDecorations(
          state
        );
      },

      update(deco, tr) {
        if (tr.docChanged) {
          return buildJsonDecorations(
            tr.state
          );
        }

        return deco.map(
          tr.changes
        );
      },

      provide: (field) =>
        EditorView.decorations.from(
          field
        ),
    });

  const jsonFoldExtension =
    foldService.of(
      (state, lineStart, lineEnd) => {
        const text =
          state.doc.toString();

        const lineText =
          text.slice(
            lineStart,
            lineEnd
          );

        const openerIndex =
          lineText.search(
            /[\{\[]/
          );

        if (openerIndex === -1) {
          return null;
        }

        const from =
          lineStart + openerIndex;

        const opener =
          text[from];

        const closer =
          opener === "{"
            ? "}"
            : "]";

        let depth = 0;
        let inString = false;
        let escaped = false;

        for (
          let index = from;
          index < text.length;
          index++
        ) {
          const char =
            text[index];

          if (inString) {
            if (escaped) {
              escaped = false;
            } else if (char === "\\") {
              escaped = true;
            } else if (char === '"') {
              inString = false;
            }

            continue;
          }

          if (char === '"') {
            inString = true;
            continue;
          }

          if (char === opener) {
            depth++;
          } else if (char === closer) {
            depth--;

            if (depth === 0) {
              if (
                index <= lineEnd
              ) {
                return null;
              }

              return {
                from: from + 1,
                to: index,
              };
            }
          }
        }

        return null;
      }
    );

  // ope không có con trỏ chuột thì nhạt màu hơn
  function buildInactiveDecorations(state: EditorState) {
    const builder = new RangeSetBuilder<Decoration>();
    const doc = state.doc.toString();
    const cursor = state.selection.main.head;

    // ✅ Tự scan operation ranges bằng regex + bracket counting
    // Không dùng parse() vì GraphQL spec không cho phép nhiều anonymous operation
    const operationRegex = /\b(query|mutation|subscription)\b/g;

    const ranges: { start: number; end: number }[] = [];

    let match: RegExpExecArray | null;
    while ((match = operationRegex.exec(doc))) {
      const start = match.index;
      const searchFrom = match.index + match[0].length;
      const braceStart = doc.indexOf("{", searchFrom);
      if (braceStart === -1) continue;

      let depth = 0;
      let end = doc.length;
      for (let i = braceStart; i < doc.length; i++) {
        if (doc[i] === "{") depth++;
        else if (doc[i] === "}") {
          depth--;
          if (depth === 0) { end = i + 1; break; }
        }
      }

      ranges.push({ start, end });
    }

    // Tìm operation active (cursor nằm trong range nào)
    const activeRange = ranges.find(r => cursorInOperationRange(cursor, r.start, r.end)) ?? null;

    // Active block dùng cursor/caret hiện tại, các block còn lại bị dim.
    const sortedRanges = ranges.sort((a, b) => a.start - b.start);

    for (const { start, end } of sortedRanges) {
      const isActive =
        !!activeRange &&
        activeRange.start === start &&
        activeRange.end === end;

      builder.add(
        start,
        end,
        Decoration.mark({
          class: isActive
            ? "cm-operation-active"
            : "cm-operation-inactive",
        })
      );
    }

    return builder.finish();
  }


  // ── Init editor ────────────────────────────────────────────────────
  useEffect(() => {
    if (!editorDomRef.current) return;

    const startState = EditorState.create({
      // doc: "# Tải schema và click vào field để bắt đầu\n# Hoặc tự gõ query của bạn ở đây\n",
      extensions: [
        history(),
        lineNumbers(),
        customFoldGutter,
        highlightSelectionMatches(),
        search({
          top: true
        }),
        // keymap.of([
        //   ...defaultKeymap,
        //   ...historyKeymap,
        //   ...foldKeymap,
        //   ...completionKeymap,
        //   ...closeBracketsKeymap,
        //   ...lintKeymap,
        //   indentWithTab,
        // ]),
        Prec.high(
          keymap.of([
            {
              key: "Mod-f",
              run(view) {
                openSearchPanel(view);
                // Dùng setTimeout thay requestAnimationFrame để chắc hơn
                setTimeout(() => {
                  const panel = view.dom.querySelector(".cm-search");
                  if (!panel) return;
                  panel.classList.remove("cm-show-replace");
                }, 0);
                return true;
              },
            },

            {
              key: "Mod-h",
              run(view) {
                openSearchPanel(view);
                setTimeout(() => {
                  const panel = view.dom.querySelector(".cm-search");
                  if (!panel) return;
                  panel.classList.add("cm-show-replace");

                  // Focus thẳng vào replace input
                  const replaceInput = panel.querySelector("input[name='replace']") as HTMLInputElement;
                  replaceInput?.focus();
                }, 0);
                return true;
              },
            },
            {
              key: "Escape",
              run(view) {
                closeSearchPanel(view);
                return true;
              },
            },
            {
              key: "F3",
              run: findNext,
              shift: findPrevious,
            },
          ])
        ),
        inactiveOperationField,
        createOperationListener(),
        createScrollNormalizer(),
        drawSelection(),
        rectangularSelection(),
        crosshairCursor(),
        bracketMatching(),
        closeBrackets(),
        indentOnInput(),
        autocompletion(),
        gqlDarkTheme,
        gqlHighlight,
        graphqlMode(undefined, { onCompletionInfoRender: undefined } as any),
        buildLinter(),
        indentationMarkers({
          highlightActiveBlock: true,
        }),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          ...closeBracketsKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
      ],
    });

    const view = new EditorView({
      state: startState,
      parent: editorDomRef.current,
    });

    view.dom.style.height = "100%";
    view.dom.style.width = "100%";
    view.dom.style.minHeight = "0";
    view.dom.style.overflow = "hidden";
    view.scrollDOM.style.height = "100%";
    view.scrollDOM.style.overflowY = "auto";
    view.scrollDOM.style.overflowX = "auto";

    editorViewRef.current["operation"] = view;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSearchPanel(view);
      }
    };

    document.addEventListener("keydown", handleEsc);

    return () => {
      view.destroy();
      document.removeEventListener("keydown", handleEsc);
    };
  }, [buildLinter]);

  useEffect(() => {
    if (
      !variablesDomRef.current ||
      !headersDomRef.current ||
      !resultDomRef.current
    ) {
      return;
    }

    const commonExtensions = [
      lineNumbers(),
      customFoldGutter,
      history(),
      drawSelection(),
      rectangularSelection(),
      crosshairCursor(),
      bracketMatching(),
      closeBrackets(),
      indentOnInput(),
      jsonFoldExtension,
      jsonHighlightField,
      gqlDarkTheme,
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...closeBracketsKeymap,
        indentWithTab,
      ]),
    ];

    const variablesView =
      new EditorView({
        state: EditorState.create({
          doc: "{}",
          extensions: commonExtensions,
        }),
        parent:
          variablesDomRef.current,
      });

    const headersView =
      new EditorView({
        state: EditorState.create({
          doc: "{}",
          extensions: commonExtensions,
        }),
        parent:
          headersDomRef.current,
      });

    const resultView =
      new EditorView({
        state: EditorState.create({
          doc: JSON.stringify(
            {
              data: null,
            },
            null,
            2
          ),
          extensions: [
            ...commonExtensions,
            EditorState.readOnly.of(true),
            EditorView.editable.of(false),
          ],
        }),
        parent:
          resultDomRef.current,
      });

    [variablesView, headersView, resultView].forEach(
      (view) => {
        view.dom.style.height = "100%";
        view.dom.style.width = "100%";
        view.dom.style.minHeight = "0";
        view.dom.style.overflow = "hidden";
        view.scrollDOM.style.height = "100%";
        view.scrollDOM.style.overflowY = "auto";
        view.scrollDOM.style.overflowX = "auto";
      }
    );

    editorViewRef.current[
      "variables"
    ] = variablesView;
    editorViewRef.current[
      "headers"
    ] = headersView;
    editorViewRef.current[
      "result"
    ] = resultView;

    return () => {
      variablesView.destroy();
      headersView.destroy();
      resultView.destroy();
      delete editorViewRef.current[
        "variables"
      ];
      delete editorViewRef.current[
        "headers"
      ];
      delete editorViewRef.current[
        "result"
      ];
    };
  }, []);

  // detect vị trí con trỏ để xem đang trong query hay mutation
  function cursorInOperationRange(
    cursor: number,
    start: number,
    end: number
  ) {
    return (
      cursor >= start &&
      cursor <= end
    );
  }

  function getRootOperations(view: EditorView) {
    const doc = view.state.doc.toString();

    return {
      query: /^[ \t]*query\b/m.test(doc),
      mutation: /^[ \t]*mutation\b/m.test(doc),
    };
  }

  function getOperationAtCursor(view: EditorView) {
    const doc =
      view.state.doc.toString();

    const cursor =
      view.state.selection.main.head;

    // ===== ƯU TIÊN AST =====
    try {
      const ast = parse(doc, {
        noLocation: false,
      });

      for (const def of ast.definitions) {
        if (
          def.kind !==
          "OperationDefinition"
        ) {
          continue;
        }

        const loc = def.loc;

        if (!loc) {
          continue;
        }

        if (
          cursorInOperationRange(
            cursor,
            loc.start,
            loc.end
          )
        ) {
          const fieldName =
            def.selectionSet.selections
              .filter(
                (selection): selection is FieldNode =>
                  selection.kind ===
                  "Field"
              )
              .map(
                (field) =>
                  field.name.value
              );

          return {
            type: def.operation,

            name:
              def.name?.value ??
              null,

            fieldName,
          };
        }
      }
    } catch (err) {
      // parse fail -> fallback regex
    }

    // ===== FALLBACK REGEX =====

    const operationRegex =
      /\b(query|mutation|subscription)\b/g;

    let match: RegExpExecArray | null;

    while (
      (match =
        operationRegex.exec(doc))
    ) {
      const type =
        match[1] as
        | "query"
        | "mutation"
        | "subscription";

      const start =
        match.index;

      const braceStart =
        doc.indexOf(
          "{",
          operationRegex.lastIndex
        );

      if (braceStart === -1) {
        continue;
      }

      let depth = 0;
      let end = doc.length;

      for (
        let i = braceStart;
        i < doc.length;
        i++
      ) {
        if (doc[i] === "{") {
          depth++;
        }

        if (doc[i] === "}") {
          depth--;

          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }

      if (
        cursor < start ||
        cursor > end
      ) {
        continue;
      }

      const between =
        doc.slice(
          match.index +
          match[0].length,
          braceStart
        ).trim();

      const opName =
        between.split(/[\s(]/)[0] ||
        null;

      // chỉ lấy root field
      const body =
        doc.slice(
          braceStart + 1,
          end - 1
        );

      const fieldName: string[] = [];

      const rootFieldRegex =
        /^[ \t]*([a-zA-Z_][a-zA-Z0-9_]*)\s*(?=\(|\{)/gm;

      let fieldMatch:
        | RegExpExecArray
        | null;

      while (
        (fieldMatch =
          rootFieldRegex.exec(body))
      ) {
        fieldName.push(
          fieldMatch[1]
        );
      }

      return {
        type,
        name: opName,
        fieldName,
      };
    }

    return null;
  }

  function createOperationListener() {
    return EditorView.updateListener.of((update) => {
      if (
        !update.docChanged &&
        !update.selectionSet
      ) {
        return;
      }

      const operation = getOperationAtCursor(
        update.view
      );
      setCanRunOperation(
        operationCanRun(update.view)
      );

      const docOperations = getRootOperations(update.view);

      if (operation) {
        // cursor đang nằm trong operation
        setRootOperations({
          query:
            operation.type === "query",

          mutation:
            operation.type === "mutation",
        });
      } else {
        // cursor không nằm trong operation
        // fallback sang trạng thái document
        setRootOperations(docOperations);
      }
    });
  }

  function createScrollNormalizer() {
    return EditorView.updateListener.of((update) => {
      if (!update.docChanged) {
        return;
      }

      requestAnimationFrame(() => {
        const scroller =
          update.view.scrollDOM;

        const maxScrollTop =
          Math.max(
            0,
            scroller.scrollHeight -
              scroller.clientHeight
          );

        if (
          scroller.scrollTop >
          maxScrollTop
        ) {
          scroller.scrollTop =
            maxScrollTop;
        }

        if (maxScrollTop === 0) {
          scroller.scrollTop = 0;
        }

        if (editorDomRef.current) {
          editorDomRef.current.scrollTop = 0;
        }
      });
    });
  }

  // xử lý khi click check box root operator
  function setRootOperation(type: "query" | "mutation", checked: boolean) {
    const view = editorViewRef.current["operation"];

    if (!view) { return; };

    const doc = view.state.doc.toString();
    const cursor = view.state.selection.main.head;

    // UNCHECK
    if (!checked) {
      const currentOperation =
        getOperationAtCursor(view);

      try {
        const ast = parse(doc, { noLocation: false });

        const changes: { from: number; to: number; insert: string }[] = [];

        for (const def of ast.definitions) {
          if (def.kind !== "OperationDefinition") continue;
          if (def.operation !== type) continue;
          const loc = def.loc;
          if (!loc) continue;

          if (currentOperation) {
            // ✅ so sánh bằng vị trí thay vì tên
            const isCurrent =
              currentOperation.type === def.operation &&
              cursorInOperationRange(
                cursor,
                loc.start,
                loc.end
              );

            if (!isCurrent) continue;

            changes.push({ from: loc.start, to: loc.end, insert: "" });
            break;
          }

          // cursor ngoài operation — xóa toàn bộ cùng type
          changes.push({ from: loc.start, to: loc.end, insert: "" });
        }

        if (changes.length > 0) {
          view.dispatch({ changes: changes.reverse() });
          // trim khoảng trống 2 đầu
          const newDoc = view.state.doc.toString();
          const trimmed = newDoc.trim();
          if (trimmed !== newDoc) {
            view.dispatch({
              changes: {
                from: 0,
                to: newDoc.length,
                insert: trimmed,
              }
            });
          }
        }
      } catch (e) {
        const scannedOps = (() => {
          const operationRegex = /\b(query|mutation|subscription)\b/g;
          const ops: { type: string; start: number; end: number }[] = [];
          let m: RegExpExecArray | null;
          while ((m = operationRegex.exec(doc))) {
            const opType = m[1];
            const searchFrom = m.index + m[0].length;
            const braceStart = doc.indexOf("{", searchFrom);
            if (braceStart === -1) continue;

            let depth = 0;
            let end = doc.length;
            for (let i = braceStart; i < doc.length; i++) {
              if (doc[i] === "{") depth++;
              else if (doc[i] === "}") {
                depth--;
                if (depth === 0) { end = i + 1; break; }
              }
            }
            ops.push({ type: opType, start: m.index, end });
            operationRegex.lastIndex = end; // ✅ skip qua body đã scan
          }
          return ops;
        })();

        const changes: { from: number; to: number; insert: string }[] = [];

        if (currentOperation) {
          // cursor trong operation — chỉ xóa operation đó
          const target = scannedOps.find(
            op => op.type === type &&
              cursorInOperationRange(
                cursor,
                op.start,
                op.end
              )
          );
          if (target) {
            changes.push({ from: target.start, to: target.end, insert: "" });
          }
        } else {
          // cursor ngoài — xóa tất cả cùng type
          for (const op of scannedOps) {
            if (op.type === type) {
              changes.push({ from: op.start, to: op.end, insert: "" });
            }
          }
        }

        if (changes.length > 0) {
          view.dispatch({ changes: changes.sort((a, b) => b.from - a.from) });
          // trim khoảng trống 2 đầu
          const newDoc = view.state.doc.toString();
          const trimmed = newDoc.trim();
          if (trimmed !== newDoc) {
            view.dispatch({
              changes: {
                from: 0,
                to: newDoc.length,
                insert: trimmed,
              }
            });
          }
        }
      }
      return;
    }

    const template =
      type === "query"
        ? `query {\n  \n}`
        : `mutation {\n  \n}`;

    const needsSpacing =
      doc.trim().length > 0;

    const insertText =
      (needsSpacing ? "\n\n" : "") + template;

    const insertPos = view.state.doc.length;

    view.dispatch({
      changes: {
        from: insertPos,
        insert: insertText,
      },

      selection: {
        anchor:
          insertPos +
          insertText.length -
          2,
      },
    });

    view.focus();
  }

  const [
    searchKeyword,
    setSearchKeyword,
  ] = useState("");
  const [
    documentationSearchOpen,
    setDocumentationSearchOpen,
  ] = useState(false);
  const [
    documentationSearchKeyword,
    setDocumentationSearchKeyword,
  ] = useState("");

  const [
    explorerSchema,
    setExplorerSchema,
  ] = useState<
    Record<
      string,
      ExplorerType
    >
  >({});

  function unwrapType(type: any): any {
    let current = type;

    while (
      isNonNullType(current) ||
      isListType(current)
    ) {
      current = current.ofType;
    }

    return current;
  }

// ======================================================
// BUILD EXPLORER SCHEMA
// ======================================================

  function buildExplorerSchema(schema: any) {
    const typeMap = schema.getTypeMap();

    const result: Record<
      string,
      ExplorerType
    > = {};

    Object.values(typeMap).forEach(
      (type: any) => {
        if (
          type.name.startsWith("__")
        ) {
          return;
        }

        const real =
          unwrapType(type);

        if (
          !isObjectType(real) &&
          !isInterfaceType(real)
        ) {
          return;
        }

        const fields =
          real.getFields();

        result[real.name] = {
          name: real.name,

          fields: Object.values(
            fields
          ).map((field: any) => {
            const unwrapped =
              unwrapType(
                field.type
              );

            const kind =
              isObjectType(
                unwrapped
              )
                ? "object"
                : isScalarType(
                  unwrapped
                )
                  ? "scalar"
                  : isEnumType(
                    unwrapped
                  )
                    ? "enum"
                    : isUnionType(
                      unwrapped
                    )
                      ? "union"
                      : isInterfaceType(
                        unwrapped
                      )
                        ? "interface"
                        : "scalar";

            return {
              name: field.name,

              type:
                formatTypeSig(
                  field.type
                ),

              kind,

              nextTypeName:
                unwrapped.name,

              description:
                field.description,

              args:
                field.args.map(
                  (arg: any) => ({
                    name: arg.name,

                    type:
                      formatTypeSig(
                        arg.type
                      ),
                    description:
                      arg.description ?? null,
                    rawArg:
                      arg,
                  })
                ),
            };
          }),
        };
      }
    );

    return result;
  }

  // ======================================================
  // CURRENT TYPE
  // ======================================================
  const [
    currentType,
    setCurrentType,
  ] =
    useState<string | null>(null);

  const [
    stack,
    setStack,
  ] = useState<
    {
      typeName: string | null;

      fieldName?: string;
    }[]
  >([{
      typeName: null,
      fieldName: "Root",
    }
  ]);

  const type =
    currentType
      ? explorerSchema[
        currentType
      ]
      : null;

  const [
    selectedField,
    setSelectedField,
  ] =
    useState<ExplorerField | null>(
      null
    );

  const showOperationInfo =
    !!selectedField &&
    stack.length <= 3;

  // ======================================================
  // FILTER FIELDS
  // ======================================================

  const filteredFields =
    type?.fields.filter(
      (field) => {
        const q =
          searchKeyword.toLowerCase();

        return (
          field.name
            .toLowerCase()
            .includes(q) ||
          field.type
            .toLowerCase()
            .includes(q)
        );
      }
    ) ?? [];

  // ======================================================
  // OPEN FIELD
  // ======================================================
  function openRootType(
    typeName: string
  ) {
    setCurrentType(typeName);
    setSelectedField(null);

    setStack([
      {
        typeName: null,
        fieldName: "Root",
      },
      {
        typeName,
        fieldName: typeName,
      },
    ]);

    setSearchKeyword("");
  }

  function openField(
    field: ExplorerField
  ) {
    const isRootOperation =
      currentType === "Query" ||
      currentType === "Mutation";

    if (isRootOperation) {
      setSelectedField(field);
    }

    const expandable =
      field.kind ===
      "object" ||
      field.kind ===
      "interface" ||
      field.kind ===
      "union";

    if (
      !expandable ||
      !field.nextTypeName
    ) {
      return;
    }

    setCurrentType(
      field.nextTypeName
    );

    setStack(prev => [
      ...prev,
      {
        typeName:
          field.nextTypeName!,

        fieldName:
          field.name,
      },
    ]);

    setSearchKeyword("");
  }

  function openRootOperationFromSearch(
    operationType: "Query" | "Mutation",
    field: ExplorerField
  ) {
    const expandable =
      field.kind ===
      "object" ||
      field.kind ===
      "interface" ||
      field.kind ===
      "union";

    setSelectedField(field);
    setDocumentationSearchOpen(false);
    setDocumentationSearchKeyword("");
    setSearchKeyword("");

    if (
      expandable &&
      field.nextTypeName
    ) {
      setCurrentType(
        field.nextTypeName
      );

      setStack([
        {
          typeName: null,
          fieldName: "Root",
        },
        {
          typeName:
            operationType,
          fieldName:
            operationType,
        },
        {
          typeName:
            field.nextTypeName,
          fieldName:
            field.name,
        },
      ]);

      return;
    }

    setCurrentType(
      operationType
    );

    setStack([
      {
        typeName: null,
        fieldName: "Root",
      },
      {
        typeName:
          operationType,
        fieldName:
          operationType,
      },
      {
        typeName:
          operationType,
        fieldName:
          field.name,
      },
    ]);
  }

  function fuzzyScore(
    value: string,
    keyword: string
  ) {
    const source =
      value.toLowerCase();

    const query =
      keyword.trim().toLowerCase();

    if (!query) {
      return 0;
    }

    if (source === query) {
      return 1000;
    }

    if (
      source.startsWith(
        query
      )
    ) {
      return 850 - source.length;
    }

    if (
      source.includes(
        query
      )
    ) {
      return 700 - source.indexOf(query);
    }

    let queryIndex = 0;
    let gaps = 0;
    let previousMatch = -1;

    for (
      let index = 0;
      index < source.length &&
      queryIndex < query.length;
      index++
    ) {
      if (
        source[index] ===
        query[queryIndex]
      ) {
        if (previousMatch >= 0) {
          gaps +=
            index -
            previousMatch -
            1;
        }

        previousMatch =
          index;
        queryIndex++;
      }
    }

    if (
      queryIndex ===
      query.length
    ) {
      return 420 - gaps - source.length;
    }

    let distance = 0;
    const maxLength =
      Math.max(
        source.length,
        query.length
      );

    for (
      let index = 0;
      index < maxLength;
      index++
    ) {
      if (
        source[index] !==
        query[index]
      ) {
        distance++;
      }
    }

    return Math.max(
      0,
      220 - distance * 24 - Math.abs(source.length - query.length) * 8
    );
  }

  function getDocumentationSearchResults(
    operationType: "Query" | "Mutation"
  ) {
    const fields =
      explorerSchema[
        operationType
      ]?.fields ?? [];

    const keyword =
      documentationSearchKeyword.trim();

    if (!keyword) {
      return fields.slice(
        0,
        8
      );
    }

    return fields
      .map((field) => ({
        field,
        score:
          fuzzyScore(
            field.name,
            keyword
          ),
      }))
      .filter(
        (item) =>
          item.score > 0
      )
      .sort(
        (a, b) =>
          b.score -
          a.score ||
          a.field.name.localeCompare(
            b.field.name
          )
      )
      .slice(
        0,
        8
      )
      .map(
        (item) =>
          item.field
      );
  }

  // ======================================================
  // BREADCRUMB CLICK
  // ======================================================

  function goToBreadcrumb(
    index: number
  ) {
    const newStack =
      stack.slice(
        0,
        index + 1
      );

    const target =
      newStack[
      newStack.length - 1
      ];

    setStack(newStack);

    setCurrentType(
      target.typeName
    );

    if (index < 2) {
      setSelectedField(null);
    }
  }

  useEffect(() => {
    const instance =
      scrollRef.current?.osInstance?.();

    const viewport =
      instance?.elements?.().viewport;

    if (viewport) {
      viewport.scrollTop = 0;
    } else if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [currentType]);

  function findNodeAtPath(
    selections: readonly SelectionNode[],
    path: string[]
  ): FieldNode | null {
    if (path.length === 0) return null;

    const [head, ...rest] = path;

    for (const sel of selections) {
      if (sel.kind !== "Field") continue;
      if (sel.name.value !== head) continue;

      if (rest.length === 0) {
        // đến đích rồi
        return sel as FieldNode;
      }

      // đi tiếp xuống cấp dưới
      if (sel.selectionSet) {
        return findNodeAtPath(sel.selectionSet.selections, rest);
      }
    }

    return null;
  }

  function autoCloseBraces(queryString: string): string {
    let depth = 0;
    let inString = false;

    for (let i = 0; i < queryString.length; i++) {
      const char = queryString[i];

      // skip string literals
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === "{") depth++;
      if (char === "}") depth--;
    }

    // thêm số } còn thiếu vào cuối
    if (depth > 0) {
      let closing = "";
      for (let i = depth; i > 0; i--) {
        closing += "\n" + getIndent(i - 1) + "}";
      }
      return queryString + closing;
    }

    return queryString;
  }

  function ensureSelectionSet(
    queryString: string,
    targetPath: string[]
  ): string {
    if (targetPath.length === 0) {
      return queryString;
    }

    const fieldName = targetPath[targetPath.length - 1];
    const indent = getIndent(targetPath.length);
    const innerIndent = getIndent(targetPath.length + 1);

    let searchFrom = 0;
    while (true) {
      const idx = queryString.indexOf(fieldName, searchFrom);
      if (idx === -1) break;

      const before = queryString[idx - 1];
      const isWordStart = !before || /[\s\n({]/.test(before);
      if (!isWordStart) {
        searchFrom = idx + 1;
        continue;
      }

      let pos = idx + fieldName.length;

      while (pos < queryString.length && /[ \t]/.test(queryString[pos])) {
        pos++;
      }

      if (queryString[pos] === "(") {
        let depth = 1;
        pos++;
        while (pos < queryString.length && depth > 0) {
          if (queryString[pos] === "(") depth++;
          if (queryString[pos] === ")") depth--;
          pos++;
        }
      }

      while (pos < queryString.length && /[ \t]/.test(queryString[pos])) {
        pos++;
      }

      if (queryString[pos] === "{") {
        return queryString;
      }

      return (
        queryString.slice(0, pos) +
        " {\n" + innerIndent +
        "\n" + indent + "}" +
        queryString.slice(pos)
      );
    }

    return queryString;
  }

  function insertFieldAtPath(
    queryString: string,
    targetPath: string[],
    fieldToInsert: string
  ): string {
   const withBraces = ensureSelectionSet(queryString, targetPath);

    const range =
      findSelectionSetRangeForPath(
        withBraces,
        targetPath
      );

    if (!range) {
      return queryString;
    }

    if (
      fieldExistsInSelectionSet(
        withBraces,
        range.open,
        range.close,
        fieldToInsert.split(/\s|\(/)[0]
      )
    ) {
      return withBraces;
    }

    const childIndent =
      getIndent(
        targetPath.length + 1
      );

    const parentIndent =
      getIndent(
        targetPath.length
      );

    const fieldBlock =
      fieldToInsert
        .split("\n")
        .map(
          (line) =>
            `${childIndent}${line}`
        )
        .join("\n");

    const body =
      withBraces
        .slice(
          range.open + 1,
          range.close
        )
        .trim();

    const insertText =
      body.length === 0
        ? `\n${fieldBlock}\n${parentIndent}`
        : `\n${fieldBlock}`;

    return (
      withBraces.slice(
        0,
        range.close
      ) +
      insertText +
      withBraces.slice(
        range.close
      )
    );
  }

  // tạo indent theo độ sâu
  function getIndent(depth: number): string {
    return "  ".repeat(depth);
  }

  function formatQueryPreservingOperationKeyword(
    queryString: string,
    operationType?: "query" | "mutation"
  ): string {
    const looseFormatted =
      formatGraphQLLoose(
        queryString
      );

    try {
      const formatted =
        print(parse(looseFormatted));

      if (
        operationType === "query" &&
        looseFormatted.trimStart().startsWith("query") &&
        formatted.trimStart().startsWith("{")
      ) {
        return `query ${formatted}`;
      }

      return formatted;
    } catch {
      return looseFormatted;
    }
  }

  function formatGraphQLLoose(
    queryString: string
  ): string {
    const source =
      autoCloseBraces(
        stripGeneratedTypenamePlaceholders(
          queryString
        )
      );

    const lines: string[] = [];
    let token = "";
    let indent = 0;
    let parenDepth = 0;
    let inString = false;

    const pushToken = () => {
      const value =
        token.trim();

      if (value) {
        lines.push(
          `${getIndent(indent)}${value}`
        );
      }

      token = "";
    };

    for (
      let i = 0;
      i < source.length;
      i++
    ) {
      const char =
        source[i];

      if (char === '"' && source[i - 1] !== "\\") {
        inString = !inString;
        token += char;
        continue;
      }

      if (inString) {
        token += char;
        continue;
      }

      if (char === "(") {
        parenDepth++;
        token += char;
        continue;
      }

      if (char === ")") {
        parenDepth =
          Math.max(
            0,
            parenDepth - 1
          );
        token += char;
        continue;
      }

      if (char === "{" && parenDepth === 0) {
        const value =
          token.trim();

        lines.push(
          `${getIndent(indent)}${value ? `${value} ` : ""}{`
        );

        token = "";
        indent++;
        continue;
      }

      if (char === "}" && parenDepth === 0) {
        pushToken();
        indent =
          Math.max(
            0,
            indent - 1
          );
        lines.push(
          `${getIndent(indent)}}`
        );
        continue;
      }

      if (
        (char === "\n" || char === "\r") &&
        parenDepth === 0
      ) {
        pushToken();
        continue;
      }

      token += char;
    }

    pushToken();

    return lines
      .filter((line, index, all) => {
        if (line.trim()) {
          return true;
        }

        return (
          all[index - 1]?.trim() &&
          all[index + 1]?.trim()
        );
      })
      .join("\n")
      .trim();
  }

  function stripGeneratedTypenamePlaceholders(
    queryString: string
  ) {
    return queryString
      .replace(
        /^[ \t]*__typename[^\n]*(?:\n|$)/gm,
        ""
      )
      .replace(
        /\{\s*__typename\s*\}/g,
        "{\n}"
      );
  }

  function findMatchingBraceIndex(
    text: string,
    openBrace: number
  ) {
    let depth = 0;

    for (
      let i = openBrace;
      i < text.length;
      i++
    ) {
      if (text[i] === "{") {
        depth++;
      }

      if (text[i] === "}") {
        depth--;

        if (depth === 0) {
          return i;
        }
      }
    }

    return -1;
  }

  function readNameAt(
    text: string,
    pos: number
  ) {
    const match =
      /^[A-Za-z_][A-Za-z0-9_]*/.exec(
        text.slice(pos)
      );

    return match?.[0] ?? null;
  }

  function skipWhitespace(
    text: string,
    pos: number
  ) {
    let cursor = pos;

    while (
      cursor < text.length &&
      /\s/.test(text[cursor])
    ) {
      cursor++;
    }

    return cursor;
  }

  function skipParens(
    text: string,
    pos: number
  ) {
    if (text[pos] !== "(") {
      return pos;
    }

    let depth = 0;

    for (
      let i = pos;
      i < text.length;
      i++
    ) {
      if (text[i] === "(") {
        depth++;
      }

      if (text[i] === ")") {
        depth--;

        if (depth === 0) {
          return i + 1;
        }
      }
    }

    return pos;
  }

  function findFieldInSelectionSet(
    text: string,
    open: number,
    close: number,
    fieldName: string
  ) {
    let depth = 0;
    let cursor = open + 1;

    while (cursor < close) {
      const char = text[cursor];

      if (char === "{") {
        depth++;
        cursor++;
        continue;
      }

      if (char === "}") {
        depth--;
        cursor++;
        continue;
      }

      if (
        depth === 0 &&
        /[A-Za-z_]/.test(char)
      ) {
        const name =
          readNameAt(
            text,
            cursor
          );

        if (!name) {
          cursor++;
          continue;
        }

        const afterName =
          skipWhitespace(
            text,
            cursor + name.length
          );

        const afterArgs =
          skipWhitespace(
            text,
            skipParens(
              text,
              afterName
            )
          );

        const selectionOpen =
          text[afterArgs] === "{"
            ? afterArgs
            : -1;

        const selectionClose =
          selectionOpen >= 0
            ? findMatchingBraceIndex(
              text,
              selectionOpen
            )
            : -1;

        if (name === fieldName) {
          return {
            start: cursor,
            end:
              selectionClose >= 0
                ? selectionClose + 1
                : cursor + name.length,
            selectionOpen,
            selectionClose,
          };
        }

        cursor =
          selectionClose >= 0
            ? selectionClose + 1
            : cursor + name.length;
        continue;
      }

      cursor++;
    }

    return null;
  }

  function getRootSelectionSetRange(
    text: string
  ) {
    const open =
      text.indexOf("{");

    if (open === -1) {
      return null;
    }

    const close =
      findMatchingBraceIndex(
        text,
        open
      );

    if (close === -1) {
      return null;
    }

    return {
      open,
      close,
    };
  }

  function findSelectionSetRangeForPath(
    text: string,
    path: string[]
  ) {
    let current =
      getRootSelectionSetRange(
        text
      );

    if (!current) {
      return null;
    }

    for (const fieldName of path) {
      const field =
        findFieldInSelectionSet(
          text,
          current.open,
          current.close,
          fieldName
        );

      if (
        !field ||
        field.selectionOpen < 0 ||
        field.selectionClose < 0
      ) {
        return null;
      }

      current = {
        open:
          field.selectionOpen,
        close:
          field.selectionClose,
      };
    }

    return current;
  }

  function fieldExistsInSelectionSet(
    text: string,
    open: number,
    close: number,
    fieldName: string
  ) {
    return !!findFieldInSelectionSet(
      text,
      open,
      close,
      fieldName
    );
  }

  function ensureFieldPath(
    queryString: string,
    fullPath: string[]
  ) {
    let query =
      autoCloseBraces(
        queryString
      );

    let parentPath: string[] = [];

    for (const fieldName of fullPath) {
      const parentRange =
        findSelectionSetRangeForPath(
          query,
          parentPath
        );

      if (!parentRange) {
        return query;
      }

      const existingField =
        findFieldInSelectionSet(
          query,
          parentRange.open,
          parentRange.close,
          fieldName
        );

      if (!existingField) {
        query =
          insertFieldAtPath(
            query,
            parentPath,
            `${fieldName} {\n\n}`
          );
      } else if (
        existingField.selectionOpen < 0 ||
        existingField.selectionClose < 0
      ) {
        query =
          ensureSelectionSet(
            query,
            [
              ...parentPath,
              fieldName,
            ]
          );
      }

      parentPath = [
        ...parentPath,
        fieldName,
      ];
    }

    return query;
  }

  function getOperationRangesFromText(
    query: string
  ) {
    const operationRegex =
      /\b(query|mutation|subscription)\b/g;

    const ranges: {
      type: "query" | "mutation" | "subscription";
      start: number;
      end: number;
    }[] = [];

    let match: RegExpExecArray | null;

    while (
      (match =
        operationRegex.exec(query))
    ) {
      const openBrace =
        query.indexOf(
          "{",
          match.index +
            match[0].length
        );

      if (openBrace === -1) {
        continue;
      }

      const closeBrace =
        findMatchingBraceIndex(
          query,
          openBrace
        );

      if (closeBrace === -1) {
        continue;
      }

      ranges.push({
        type:
          match[1] as
            | "query"
            | "mutation"
            | "subscription",
        start:
          match.index,
        end:
          closeBrace + 1,
      });

      operationRegex.lastIndex =
        closeBrace + 1;
    }

    return ranges;
  }


  function replaceOperationAtRange(
    fullQuery: string,
    start: number,
    end: number,
    nextOperation: string
  ) {

    return (
      fullQuery.slice(0, start) +
      nextOperation +
      fullQuery.slice(end)
    );
  }

  function getCurrentOperationByCursor(
  query: string,
  cursorPos: number
): {
  operation: OperationDefinitionNode | null;
  operationType: "query" | "mutation" | null;
  operationStart: number;
  operationEnd: number;
} {

  const textRange =
    getOperationRangesFromText(
      query
    ).find(
      (range) =>
        cursorInOperationRange(
          cursorPos,
          range.start,
          range.end
        )
    );

  if (textRange) {
    return {
      operation: null,
      operationType:
        textRange.type ===
        "subscription"
          ? null
          : textRange.type,
      operationStart:
        textRange.start,
      operationEnd:
        textRange.end,
    };
  }

  try {

    // parse bằng normalized
    const normalized =
      query.replace(
        /\{\s*\}/gs,
        "{ __typename }"
      );

    const ast = parse(
      normalized,
      {
        noLocation: false,
      }
    );

    for (const def of ast.definitions) {

      if (
        def.kind !==
        Kind.OPERATION_DEFINITION
      ) {
        continue;
      }

      const start =
        def.loc?.start ?? 0;

      const end =
        def.loc?.end ?? 0;

      if (
        cursorInOperationRange(
          cursorPos,
          start,
          end
        )
      ) {

        return {
          operation: def,

          operationType:
            def.operation as
              | "query"
              | "mutation",

          operationStart:
            start,

          operationEnd:
            end,
        };
      }
    }

  } catch (e) {

    console.error(
      "getCurrentOperationByCursor",
      e
    );
  }

  return {
    operation: null,
    operationType: null,
    operationStart: 0,
    operationEnd: 0,
  };
}

  function getRootOperationType(
    schema: GraphQLSchema,
    rootFieldName: string
  ): "query" | "mutation" | null {

    const queryType =
      schema.getQueryType();

    const mutationType =
      schema.getMutationType();

    if (
      queryType
        ?.getFields?.()[
          rootFieldName
        ]
    ) {
      return "query";
    }

    if (
      mutationType
        ?.getFields?.()[
          rootFieldName
        ]
    ) {
      return "mutation";
    }

    return null;
  }

  function getRootFieldDefinition(
    schema: GraphQLSchema,
    rootFieldName: string
  ) {
    const queryField =
      schema.getQueryType()
        ?.getFields?.()[
        rootFieldName
      ];

    if (queryField) {
      return queryField;
    }

    return schema.getMutationType()
      ?.getFields?.()[
      rootFieldName
    ] ?? null;
  }

  function fieldNeedsSelectionSet(
    field:
      | ExplorerField
      | GraphQLField<unknown, unknown>
  ) {
    if ("kind" in field) {
      return (
        field.kind === "object" ||
        field.kind === "interface" ||
        field.kind === "union"
      );
    }

    const namedType =
      getNamedType(field.type);

    return (
      isObjectType(namedType) ||
      isInterfaceType(namedType) ||
      isUnionType(namedType)
    );
  }

  function buildFieldSelectionSnippet(
    field: ExplorerField
  ) {
    if (fieldNeedsSelectionSet(field)) {
      return `${field.name} {\n\n}`;
    }

    return field.name;
  }

  function buildNestedSelectionSnippet(
    path: string[],
    leafSnippet: string
  ) {
    return path.reduceRight(
      (inner, fieldName) =>
        `${fieldName} {\n${inner}\n}`,
      leafSnippet
    );
  }

  function getRequiredArguments(
    field:
      | ExplorerField
      | GraphQLField<unknown, unknown>
  ) {
    const args =
      "rawField" in field
        ? (field.rawField as GraphQLField<unknown, unknown>).args
        : field.args;

    return (args as GraphQLArgument[]).filter(
      (arg: any) =>
        isNonNullType(arg.type) &&
        arg.defaultValue === undefined
    );
  }

  function buildFieldArgumentCall(
    fieldName: string,
    args: GraphQLArgument[]
  ) {
    if (args.length === 0) {
      return fieldName;
    }

    return `${fieldName}(${args
      .map(
        (arg) =>
          `${arg.name}: $${arg.name}`
      )
      .join(", ")})`;
  }

  function syncRequiredArgumentVariables(
    args: GraphQLArgument[]
  ) {
    args.forEach((arg) => {
      ensureVariableEditorValue(
        arg.name,
        arg
      );
    });
  }

  function buildRootFieldLine(
    rootFieldName: string,
    schema: GraphQLSchema
  ) {
    const rootField =
      getRootFieldDefinition(
        schema,
        rootFieldName
      );

    if (!rootField) {
      return "";
    }

    const requiredArgs =
      getRequiredArguments(
        rootField
      ) as GraphQLArgument[];

    const rootFieldCall =
      buildFieldArgumentCall(
        rootFieldName,
        requiredArgs
      );

    if (
      fieldNeedsSelectionSet(
        rootField
      )
    ) {
      return `${rootFieldCall} {\n\n}`;
    }

    return rootFieldCall;
  }

  function generateOperationForSelection(
    schema: GraphQLSchema,
    rootFieldName: string,
    targetPath: string[],
    field: ExplorerField,
    fullQuery = ""
  ) {
    const rootField =
      getRootFieldDefinition(
        schema,
        rootFieldName
      );

    if (!rootField) {
      return "";
    }

    const operationType =
      getRootOperationType(
        schema,
        rootFieldName
      );

    if (!operationType) {
      return "";
    }

    const isRootFieldClick =
      targetPath.length === 0 &&
      field.name === rootFieldName;

    const requiredArgs =
      getRequiredArguments(
        rootField
      ) as GraphQLArgument[];

    const rootFieldCall =
      buildFieldArgumentCall(
        rootFieldName,
        requiredArgs
      );

    const rootSelection =
      isRootFieldClick
        ? fieldNeedsSelectionSet(
          rootField
        )
          ? "\n"
          : ""
        : buildNestedSelectionSnippet(
          targetPath,
          buildFieldSelectionSnippet(
            field
          )
        );

    const rootLine =
      rootSelection
        ? `  ${rootFieldCall} {\n${rootSelection.split("\n").map((line) => `    ${line}`).join("\n")}\n  }`
        : `  ${rootFieldCall}`;

    const operationName =
      createUniqueOperationName(
        fullQuery,
        rootFieldName.replace(
          /^[a-z]/,
          (c) =>
            c.toUpperCase()
        )
      );

    const variableDefinitions =
      requiredArgs.length > 0
        ? `(${requiredArgs
          .map(
            (arg) =>
              `$${arg.name}: ${typeToString(arg.type)}`
          )
          .join(", ")})`
        : "";

    const query = [
      `${operationType} ${operationName}${variableDefinitions} {`,
      rootLine,
      `}`,
    ].join("\n");

    return formatGraphQLLoose(
      query
    );
  }

  function getOperationNames(
    query: string
  ) {
    const names =
      new Set<string>();

    const operationRegex =
      /\b(query|mutation|subscription)\s+([A-Za-z_][A-Za-z0-9_]*)/g;

    let match: RegExpExecArray | null;

    while (
      (match =
        operationRegex.exec(query))
    ) {
      names.add(
        match[2]
      );
    }

    return names;
  }

  function createUniqueOperationName(
    query: string,
    baseName: string
  ) {
    const existingNames =
      getOperationNames(
        query
      );

    if (
      !existingNames.has(
        baseName
      )
    ) {
      return baseName;
    }

    let index = 2;

    while (
      existingNames.has(
        `${baseName}${index}`
      )
    ) {
      index++;
    }

    return `${baseName}${index}`;
  }

  function getOperationRangeForType(
    query: string,
    operationType: "query" | "mutation",
    cursorPos: number
  ) {
    const ranges =
      getOperationRangesFromText(
        query
      ).filter(
        (range) =>
          range.type ===
          operationType
      );

    const currentRange =
      ranges.find(
        (range) =>
          cursorInOperationRange(
            cursorPos,
            range.start,
            range.end
          )
      );

    if (currentRange) {
      return {
        start:
          currentRange.start,
        end:
          currentRange.end,
      };
    }

    if (
      getOperationRangesFromText(
        query
      ).some(
        (range) =>
          cursorInOperationRange(
            cursorPos,
            range.start,
            range.end
          )
      )
    ) {
      return null;
    }

    try {
      const ast = parse(
        query.replace(
          /\{\s*\}/gs,
          "{ __typename }"
        ),
        {
          noLocation: false,
        }
      );

      const operations =
        ast.definitions.filter(
          (
            def
          ): def is OperationDefinitionNode =>
            def.kind ===
            Kind.OPERATION_DEFINITION &&
            def.operation ===
            operationType &&
            !!def.loc
        );

      const current =
        operations.find(
          (def) =>
            cursorInOperationRange(
              cursorPos,
              def.loc!.start,
              def.loc!.end
            )
        );

      if (!current?.loc) {
        return null;
      }

      return {
        start:
          current.loc.start,
        end:
          current.loc.end,
      };
    } catch {
      return null;
    }
  }

  function selectionExistsInQuery(
    query: string,
    rootFieldName: string,
    targetPath: string[],
    fieldName: string
  ) {
    if (!query.trim()) {
      return false;
    }

    try {
      const ast = parse(
        query.replace(
          /\{\s*\}/gs,
          "{ __typename }"
        )
      );

      for (const def of ast.definitions) {
        if (
          def.kind !==
          Kind.OPERATION_DEFINITION
        ) {
          continue;
        }

        if (
          targetPath.length === 0 &&
          fieldName === rootFieldName
        ) {
          return def.selectionSet.selections.some(
            (selection) =>
              selection.kind ===
              Kind.FIELD &&
              selection.name.value ===
              rootFieldName
          );
        }

        const targetNode =
          findNodeAtPath(
            def.selectionSet.selections,
            [
              rootFieldName,
              ...targetPath,
            ]
          );

        if (!targetNode?.selectionSet) {
          continue;
        }

        const exists =
          targetNode.selectionSet.selections.some(
            (selection) =>
              selection.kind ===
              Kind.FIELD &&
              selection.name.value ===
              fieldName
          );

        if (exists) {
          return true;
        }
      }
    } catch {
      return false;
    }

    return false;
  }

  function getCurrentOperationRange(
    query: string,
    cursorPos: number
  ) {
    const textRange =
    getOperationRangesFromText(
      query
    ).find(
      (range) =>
          cursorInOperationRange(
            cursorPos,
            range.start,
            range.end
          )
      );

    if (textRange) {
      return textRange;
    }

    const parsed =
      getCurrentOperationByCursor(
        query,
        cursorPos
      );

    if (!parsed.operationType) {
      return null;
    }

    return {
      type:
        parsed.operationType,
      start:
        parsed.operationStart,
      end:
        parsed.operationEnd,
    };
  }

  function getActiveOperationText() {
    const view =
      editorViewRef.current[
        "operation"
      ];

    if (!view) {
      return null;
    }

    const query =
      view.state.doc.toString();

    const range =
      getCurrentOperationRange(
        query,
        view.state.selection.main.head
      );

    if (!range) {
      return null;
    }

    return {
      type:
        range.type,
      text:
        query.slice(
          range.start,
          range.end
        ),
      start:
        range.start,
      end:
        range.end,
    };
  }

  function getEditorText(editorId: string) {
    return (
      editorViewRef.current[
        editorId
      ]?.state.doc.toString() ?? ""
    );
  }

  function setEditorText(
    editorId: string,
    text: string
  ) {
    const view =
      editorViewRef.current[
        editorId
      ];

    if (!view) {
      return;
    }

    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: text,
      },
    });
  }

  function readVariablesEditor() {
    const text =
      getEditorText("variables").trim();

    if (!text) {
      return {};
    }

    try {
      const parsed = JSON.parse(text);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          "Variables editor must contain a JSON object."
        );
      }

      return parsed;
    } catch {
      throw new Error(
        "Variables editor must contain a JSON object."
      );
    }
  }

  function readHeadersEditor() {
    const text =
      getEditorText("headers").trim();

    if (!text) {
      return {};
    }

    try {
      const parsed = JSON.parse(text);

      if (
        !parsed ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error(
          "Headers editor must contain a JSON object."
        );
      }

      return parsed as Record<string, string>;
    } catch {
      throw new Error(
        "Headers editor must contain a JSON object."
      );
    }
  }

  async function copyResponseToClipboard() {
    const responseText =
      getEditorText("result");

    if (!responseText) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        responseText
      );
      setResponseCopied(true);
      window.setTimeout(
        () => setResponseCopied(false),
        1200
      );
    } catch {
      setResponseCopied(false);
    }
  }

  function writeVariablesEditor(
    variables: Record<string, unknown>
  ) {
    setEditorText(
      "variables",
      JSON.stringify(variables, null, 2)
    );
  }

  function getDefaultValueForArgument(
    arg: GraphQLArgument
  ) {
    if (arg.defaultValue !== undefined) {
      return arg.defaultValue;
    }

    if (arg.astNode?.defaultValue) {
      return valueFromASTUntyped(
        arg.astNode.defaultValue
      );
    }

    const namedType =
      getNamedType(arg.type).name;

    if (
      namedType === "Int" ||
      namedType === "Float"
    ) {
      return 0;
    }

    if (namedType === "Boolean") {
      return false;
    }

    if (isListType(arg.type)) {
      return [];
    }

    if (isEnumType(getNamedType(arg.type))) {
      return "";
    }

    if (isScalarType(getNamedType(arg.type))) {
      return "";
    }

    return {};
  }

  function formatArgumentDefaultDisplay(
    arg?: GraphQLArgument
  ) {
    if (!arg) {
      return null;
    }

    const value =
      getDefaultValueForArgument(arg);

    if (value === undefined) {
      return null;
    }

    if (typeof value === "string") {
      return value ? `"${value}"` : "\"\"";
    }

    if (
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return String(value);
    }

    if (value === null) {
      return "null";
    }

    return JSON.stringify(value);
  }

  function formatExplorerArgumentDefaultDisplay(
    arg: ExplorerField["args"][number]
  ) {
    const rawDisplay =
      formatArgumentDefaultDisplay(
        arg.rawArg
      );

    if (rawDisplay !== null) {
      return rawDisplay;
    }

    const normalizedType =
      arg.type.replace(
        /[!\[\]]/g,
        ""
      );

    if (
      normalizedType === "Int" ||
      normalizedType === "Float"
    ) {
      return "0";
    }

    if (normalizedType === "Boolean") {
      return "false";
    }

    if (
      arg.type.includes("[")
    ) {
      return "[]";
    }

    return "\"\"";
  }

  function ensureVariableEditorValue(
    variableName: string,
    arg: GraphQLArgument
  ) {
    let variables:
      Record<string, unknown> = {};

    try {
      variables =
        readVariablesEditor() as Record<string, unknown>;
    } catch {
      variables = {};
    }

    if (
      Object.prototype.hasOwnProperty.call(
        variables,
        variableName
      )
    ) {
      return;
    }

    writeVariablesEditor({
      ...variables,
      [variableName]:
        getDefaultValueForArgument(arg),
    });
  }

  function ensureVariableForRootArgument(
    rootFieldName: string,
    argName: string
  ) {
    const active =
      getActiveOperationText();

    if (!active) {
      return;
    }

    const schema =
      schemaRef.current;

    const rootField =
      schema
        ? getRootFieldDefinition(
          schema,
          rootFieldName
        )
        : null;

    const rawArg =
      rootField?.args.find(
        (item) =>
          item.name === argName
      );

    if (!rawArg) {
      return;
    }

    try {
      const ast =
        parse(
          active.text.replace(
            /\{\s*\}/gs,
            "{ __typename }"
          )
        );

      for (const def of ast.definitions) {
        if (
          def.kind !==
          Kind.OPERATION_DEFINITION
        ) {
          continue;
        }

        const rootFieldNode =
          def.selectionSet.selections.find(
            (selection): selection is FieldNode =>
              selection.kind ===
                Kind.FIELD &&
              selection.name.value ===
                rootFieldName
          );

        const argumentNode =
          rootFieldNode?.arguments?.find(
            (argument) =>
              argument.name.value ===
              argName
          );

        if (
          argumentNode?.value.kind ===
          Kind.VARIABLE
        ) {
          ensureVariableEditorValue(
            argumentNode.value.name.value,
            rawArg
          );
        }
      }
    } catch {
      return;
    }
  }

  function operationCanRun(view: EditorView) {
    const schema =
      schemaRef.current;

    if (!schema || !lastEndpoint) {
      return false;
    }

    const query =
      view.state.doc.toString();

    const range =
      getCurrentOperationRange(
        query,
        view.state.selection.main.head
      );

    if (!range) {
      return false;
    }

    const operationText =
      query.slice(
        range.start,
        range.end
      );

    try {
      const ast =
        parse(operationText);

      const operation =
        ast.definitions.find(
          (definition): definition is OperationDefinitionNode =>
            definition.kind ===
            Kind.OPERATION_DEFINITION
        );

      if (
        !operation ||
        operation.operation ===
          "subscription"
      ) {
        return false;
      }

      return validate(
        schema,
        ast
      ).length === 0;
    } catch {
      return false;
    }
  }

  async function runActiveOperation() {
    const view =
      editorViewRef.current[
        "operation"
      ];

    if (
      !view ||
      !operationCanRun(view) ||
      isRunningOperation
    ) {
      return;
    }

    const active =
      getActiveOperationText();

    if (!active) {
      return;
    }

    let variables:
      | Record<string, unknown>
      | null = null;
    let requestHeaders:
      Record<string, string> = {};

    try {
      variables =
        readVariablesEditor() as Record<string, unknown>;
      requestHeaders =
        readHeadersEditor();
    } catch {
      setEditorText(
        "result",
        JSON.stringify(
          {
            errors: [
              {
                message:
                  "Variables and Headers editors must contain JSON objects.",
              },
            ],
          },
          null,
          2
        )
      );
      return;
    }

    setIsRunningOperation(true);
    setEditorText(
      "result",
      JSON.stringify(
        {
          loading: true,
        },
        null,
        2
      )
    );

    try {
      const res =
        await SendRequest({
          url: lastEndpoint,
          method: "POST",
          headers: {
            ...requestHeaders,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: active.text,
            variables,
          }),
        });

      if (res.error) {
        setEditorText(
          "result",
          JSON.stringify(
            {
              errors: [
                {
                  message: res.error,
                },
              ],
            },
            null,
            2
          )
        );
        return;
      }

      try {
        setEditorText(
          "result",
          JSON.stringify(
            JSON.parse(res.body),
            null,
            2
          )
        );
      } catch {
        setEditorText(
          "result",
          res.body
        );
      }
    } finally {
      setIsRunningOperation(false);
      setCanRunOperation(
        operationCanRun(view)
      );
    }
  }

  function selectionExistsInActiveOperation(
    rootFieldName: string,
    targetPath: string[],
    fieldName: string
  ) {
    const active =
      getActiveOperationText();

    if (!active) {
      return false;
    }

    const fieldOperationType =
      schemaRef.current
        ? getRootOperationType(
          schemaRef.current,
          rootFieldName
        )
        : null;

    if (
      fieldOperationType &&
      active.type !==
        fieldOperationType
    ) {
      return false;
    }

    return selectionExistsInQuery(
      active.text,
      rootFieldName,
      targetPath,
      fieldName
    );
  }

  function rootArgumentExistsInOperation(
    operationText: string,
    rootFieldName: string,
    argName: string
  ) {
    try {
      const ast =
        parse(
          operationText.replace(
            /\{\s*\}/gs,
            "{ __typename }"
          )
        );

      for (const def of ast.definitions) {
        if (
          def.kind !==
          Kind.OPERATION_DEFINITION
        ) {
          continue;
        }

        const rootField =
          def.selectionSet.selections.find(
            (selection): selection is FieldNode =>
              selection.kind ===
                Kind.FIELD &&
              selection.name.value ===
                rootFieldName
          );

        return !!rootField?.arguments?.some(
          (argument) =>
            argument.name.value ===
            argName
        );
      }
    } catch {
      return false;
    }

    return false;
  }

  function rootArgumentExistsInActiveOperation(
    rootFieldName: string,
    argName: string
  ) {
    const active =
      getActiveOperationText();

    if (!active) {
      return false;
    }

    const fieldOperationType =
      schemaRef.current
        ? getRootOperationType(
          schemaRef.current,
          rootFieldName
        )
        : null;

    if (
      fieldOperationType &&
      active.type !==
        fieldOperationType
    ) {
      return false;
    }

    return rootArgumentExistsInOperation(
      active.text,
      rootFieldName,
      argName
    );
  }

  function variableIsUsed(
    text: string,
    variableName: string
  ) {
    const usageRegex =
      new RegExp(
        `\\$${variableName}\\b`,
        "g"
      );

    return usageRegex.test(
      text
    );
  }

  function toggleRootArgumentInOperation(
    operationText: string,
    schema: GraphQLSchema,
    rootFieldName: string,
    argName: string,
    checked: boolean,
    operationType: "query" | "mutation"
  ) {
    const rootField =
      getRootFieldDefinition(
        schema,
        rootFieldName
      );

    const arg =
      rootField?.args.find(
        (item) =>
          item.name ===
          argName
      );

    if (!rootField || !arg) {
      return operationText;
    }

    let prepared =
      ensureRootFieldInOperation(
        operationText,
        rootFieldName,
        schema
      );

    const normalized =
      prepared.replace(
        /\{\s*\}/gs,
        "{ __typename }"
      );

    try {
      const ast =
        parse(
          normalized
        );

      let updated = false;
      let variableToRemove:
        | string
        | null = null;

      const nextAst = visit(ast, {
        OperationDefinition(node) {
          if (
            updated ||
            node.operation !==
              operationType
          ) {
            return node;
          }

          updated = true;

          const existingVariableNames =
            (
              node.variableDefinitions ??
              []
            ).map(
              (definition) =>
                definition.variable.name.value
            );

          let nextVariableDefinitions =
            [
              ...(node.variableDefinitions ??
                []),
            ];

          const selections =
            node.selectionSet.selections.map(
              (selection) => {
                if (
                  selection.kind !==
                    Kind.FIELD ||
                  selection.name.value !==
                    rootFieldName
                ) {
                  return selection;
                }

                const currentArgs =
                  selection.arguments ?? [];

                const existingArg =
                  currentArgs.find(
                    (argument) =>
                      argument.name.value ===
                      argName
                  );

                if (checked) {
                  if (existingArg) {
                    return selection;
                  }

                  let variableName =
                    argName;

                  if (
                    existingVariableNames.includes(
                      variableName
                    )
                  ) {
                    variableName =
                      createUniqueVariableName(
                        existingVariableNames,
                        rootFieldName,
                        argName
                      );
                  }

                  existingVariableNames.push(
                    variableName
                  );

                  nextVariableDefinitions = [
                    ...nextVariableDefinitions,
                    {
                      kind:
                        Kind.VARIABLE_DEFINITION,
                      variable: {
                        kind:
                          Kind.VARIABLE,
                        name: {
                          kind:
                            Kind.NAME,
                          value:
                            variableName,
                        },
                      },
                      type:
                        parseType(
                          typeToString(
                            arg.type
                          )
                        ),
                      directives: [],
                    } as any,
                  ];

                  return {
                    ...selection,
                    arguments: [
                      ...currentArgs,
                      {
                        kind:
                          Kind.ARGUMENT,
                        name: {
                          kind:
                            Kind.NAME,
                          value:
                            argName,
                        },
                        value: {
                          kind:
                            Kind.VARIABLE,
                          name: {
                            kind:
                              Kind.NAME,
                            value:
                              variableName,
                          },
                        },
                      },
                    ] as any,
                  };
                }

                if (!existingArg) {
                  return selection;
                }

                if (
                  existingArg.value.kind ===
                  Kind.VARIABLE
                ) {
                  variableToRemove =
                    existingArg.value.name.value;
                }

                return {
                  ...selection,
                  arguments:
                    currentArgs.filter(
                      (argument) =>
                        argument.name.value !==
                        argName
                    ),
                };
              }
            );

          if (
            !checked &&
            variableToRemove
          ) {
            const printedSelections =
              print({
                kind:
                  Kind.DOCUMENT,
                definitions: [
                  {
                    ...node,
                    variableDefinitions:
                      [],
                    selectionSet: {
                      ...node.selectionSet,
                      selections,
                    },
                  },
                ],
              });

            if (
              !variableIsUsed(
                printedSelections,
                variableToRemove
              )
            ) {
              nextVariableDefinitions =
                nextVariableDefinitions.filter(
                  (definition) =>
                    definition.variable.name.value !==
                    variableToRemove
                );
            }
          }

          return {
            ...node,
            variableDefinitions:
              nextVariableDefinitions,
            selectionSet: {
              ...node.selectionSet,
              selections,
            },
          };
        },
      });

      return formatQueryPreservingOperationKeyword(
        stripGeneratedTypenamePlaceholders(
          print(nextAst)
        ),
        operationType
      );
    } catch (e) {
      console.error(e);
      return prepared;
    }
  }

  function removeFieldSelection(
    query: string,
    fullPath: string[],
    fieldName: string
  ): string {
    const normalized =
      query.replace(
        /\{\s*\}/gs,
        "{ __typename }"
      );

    try {
      const ast = parse(
        normalized
      );

      for (const def of ast.definitions) {
        if (
          def.kind !==
          "OperationDefinition"
        ) {
          continue;
        }

        const parentSelection =
          fullPath.length === 0
            ? def.selectionSet
            : findNodeAtPath(
              def.selectionSet.selections,
              fullPath
            )?.selectionSet;

        if (!parentSelection) {
          continue;
        }

        const target =
          (
            parentSelection.selections as FieldNode[]
          ).find(
            (selection) =>
              selection.kind ===
              "Field" &&
              selection.name.value ===
              fieldName
          );

        if (!target?.loc) {
          continue;
        }

        const lineStart =
          normalized.lastIndexOf(
            "\n",
            target.loc.start
          );

        const from =
          lineStart >= 0
            ? lineStart
            : target.loc.start;

        const deleted =
          normalized.slice(0, from) +
          normalized.slice(target.loc.end);

        return stripGeneratedTypenamePlaceholders(
          deleted
        );
      }
    } catch (e) {
      console.error(e);
    }

    return query;
  }

  function insertOperationBelow(
    fullQuery: string,
    operationEnd: number,
    newOperation: string
  ) {

    return (
      fullQuery.slice(
        0,
        operationEnd
      ) +
      "\n\n" +
      newOperation +
      "\n\n" +
      fullQuery.slice(
        operationEnd
      )
    );
  }

  function insertOperationAtCursor(
    fullQuery: string,
    cursorPos: number,
    newOperation: string
  ) {
    const before =
      fullQuery.slice(
        0,
        cursorPos
      );

    const after =
      fullQuery.slice(
        cursorPos
      );

    const prefix =
      before.trim().length > 0
        ? "\n\n"
        : "";

    const suffix =
      after.trim().length > 0
        ? "\n\n"
        : "";

    const insertText =
      `${prefix}${newOperation}${suffix}`;

    return {
      nextQuery:
        before +
        insertText +
        after,
      operationStart:
        cursorPos +
        prefix.length,
    };
  }

  function capitalize(str: string) {
    return (
      str.charAt(0).toUpperCase() +
      str.slice(1)
    );
  }

  function createUniqueVariableName(
    existingNames: string[],
    rootFieldName: string,
    argName: string
  ) {
    // ví dụ:
    // getContentForPublicationSubdomain

    const base =
      rootFieldName +
      capitalize(argName);

    // nếu chưa có
    if (
      !existingNames.includes(
        base
      )
    ) {
      return base;
    }

    // nếu trùng → +2 +3...
    let i = 2;

    while (
      existingNames.includes(
        `${base}${i}`
      )
    ) {
      i++;
    }

    return `${base}${i}`;
  }

  function typeToString(type: GraphQLType): string {
    if (type instanceof GraphQLNonNull) return `${typeToString(type.ofType)}!`;
    if (type instanceof GraphQLList) return `[${typeToString(type.ofType)}]`;
    return (type as GraphQLNamedType).name;
  }

  function ensureRootFieldInOperation(
  query: string,
  rootFieldName: string,
  schema: GraphQLSchema
): string {
  const rootRange =
    getRootSelectionSetRange(
      query
    );

  if (!rootRange) {
    return query;
  }

  if (
    fieldExistsInSelectionSet(
      query,
      rootRange.open,
      rootRange.close,
      rootFieldName
    )
  ) {
    return query;
  }

  const rootFieldLine =
    buildRootFieldLine(
      rootFieldName,
      schema
    );

  if (!rootFieldLine) {
    return query;
  }

  return insertFieldAtPath(
    query,
    [],
    rootFieldLine
  );
}

  function handleFieldClick(
  rootFieldName: string,
  targetPath: string[],
  field: ExplorerField,
  checked: boolean
) {

  const view =
    editorViewRef.current[
      "operation"
    ];

  if (!view) {
    return;
  }

  const schema =
    schemaRef.current;

  if (!schema) {
    return;
  }

  const fullQuery =
    view.state.doc.toString();

  const cursorPos =
    view.state.selection.main.head;

  const currentOperation =
    getCurrentOperationByCursor(
      fullQuery,
      cursorPos
    );

  const fieldOperationType =
    getRootOperationType(
      schema,
      rootFieldName
    );

  if (!fieldOperationType) {
    return;
  }

  const isRootFieldClick =
    targetPath.length === 0 &&
    field.name === rootFieldName;

  const rootFieldDefinition =
    getRootFieldDefinition(
      schema,
      rootFieldName
    );

  const requiredRootArgs =
    rootFieldDefinition
      ? getRequiredArguments(
        rootFieldDefinition
      ) as GraphQLArgument[]
      : [];

  const operationRange =
    getOperationRangeForType(
      fullQuery,
      fieldOperationType,
      cursorPos
    );

  if (!checked) {
    if (!operationRange) {
      return;
    }

    const operationText =
      fullQuery.slice(
        operationRange.start,
        operationRange.end
      );

    const nextOperation =
      removeFieldSelection(
        operationText,
        isRootFieldClick
          ? []
          : [
            rootFieldName,
            ...targetPath,
          ],
        field.name
      );

    const formattedNextOperation =
      stripGeneratedTypenamePlaceholders(
        formatQueryPreservingOperationKeyword(
          nextOperation,
          fieldOperationType
        )
      );

    const nextFullQuery =
      replaceOperationAtRange(
        fullQuery,
        operationRange.start,
        operationRange.end,
        formattedNextOperation
      );

    view.dispatch({
      changes: {
        from: 0,
        to:
          view.state.doc.length,
        insert:
          nextFullQuery,
      },
      selection: {
        anchor:
          Math.min(
              operationRange.start +
              Math.max(
                0,
                formattedNextOperation.length - 1
              ),
            nextFullQuery.length
          ),
      },
    });

    view.focus();
    syncRequiredArgumentVariables(
      requiredRootArgs
    );

    return;
  }

  if (
    selectionExistsInActiveOperation(
      rootFieldName,
      targetPath,
      field.name
    )
  ) {
    view.focus();
    return;
  }

  // ==================================================
  // EMPTY EDITOR
  // ==================================================

  if (
    !fullQuery.trim()
  ) {

    const generated =
      generateOperationForSelection(
        schema,
        rootFieldName,
        targetPath,
        field,
        fullQuery
      );

    view.dispatch({
      changes: {
        from: 0,
        to:
          view.state.doc.length,
        insert:
          generated,
      },
      selection: {
        anchor:
          Math.max(
            0,
            generated.length - 1
          ),
      },
    });

    view.focus();
    syncRequiredArgumentVariables(
      requiredRootArgs
    );

    return;
  }

  if (
    !operationRange &&
    currentOperation.operationType === null
  ) {
    const generated =
      generateOperationForSelection(
        schema,
        rootFieldName,
        targetPath,
        field,
        fullQuery
      );

    const inserted =
      insertOperationAtCursor(
        fullQuery,
        cursorPos,
        generated
      );

    view.dispatch({
      changes: {
        from: 0,
        to:
          view.state.doc.length,
        insert:
          inserted.nextQuery,
      },
      selection: {
        anchor:
          inserted.operationStart +
          Math.max(
            0,
            generated.length - 1
          ),
      },
    });

    view.focus();
    syncRequiredArgumentVariables(
      requiredRootArgs
    );

    return;
  }

  // ==================================================
  // DIFFERENT OPERATION TYPE
  // ==================================================

  if (
    currentOperation.operationType &&
    fieldOperationType &&
    currentOperation.operationType !==
      fieldOperationType
  ) {

    const newOperation =
      generateOperationForSelection(
        schema,
        rootFieldName,
        targetPath,
        field,
        fullQuery
      );

    const nextQuery =
      insertOperationBelow(
        fullQuery,
        currentOperation.operationEnd,
        newOperation
      );
    const newOperationStart =
      currentOperation.operationEnd +
      2;

    view.dispatch({
      changes: {
        from: 0,
        to:
          view.state.doc.length,
        insert:
          nextQuery,
      },
      selection: {
        anchor:
          newOperationStart +
          Math.max(
            0,
            newOperation.length - 1
          ),
      },
    });

    view.focus();
    syncRequiredArgumentVariables(
      requiredRootArgs
    );

    return;
  }

  if (!operationRange) {
    const generated =
      generateOperationForSelection(
        schema,
        rootFieldName,
        targetPath,
        field,
        fullQuery
      );

    const inserted =
      insertOperationAtCursor(
        fullQuery,
        cursorPos,
        generated
      );

    view.dispatch({
      changes: {
        from: 0,
        to:
          view.state.doc.length,
        insert:
          inserted.nextQuery,
      },
      selection: {
        anchor:
          inserted.operationStart +
          Math.max(
            0,
            generated.length - 1
          ),
      },
    });

    view.focus();
    syncRequiredArgumentVariables(
      requiredRootArgs
    );

    return;
  }

  // ==================================================
  // CURRENT BLOCK
  // ==================================================

  const currentText =
    fullQuery.slice(
      operationRange.start,
      operationRange.end
    );

  const fullPath = [
    rootFieldName,
    ...targetPath,
  ];

  let query =
    autoCloseBraces(
      currentText
    );

  query =
    ensureRootFieldInOperation(
      query,
      rootFieldName,
      schema
    );

  if (!isRootFieldClick) {
    query =
      ensureFieldPath(
        query,
        fullPath
      );

    query =
      insertFieldAtPath(
        query,
        fullPath,
        buildFieldSelectionSnippet(
          field
        )
      );
  }

  query =
    formatQueryPreservingOperationKeyword(
      stripGeneratedTypenamePlaceholders(
        query
      ),
      fieldOperationType
    );

  const nextFullQuery =
    replaceOperationAtRange(
      fullQuery,
      operationRange.start,
      operationRange.end,
      query
    );

  view.dispatch({
    changes: {
      from: 0,
      to:
        view.state.doc.length,
      insert:
        nextFullQuery,
    },
    selection: {
      anchor:
        operationRange.start +
        Math.max(
          0,
          query.length - 1
        ),
    },
  });

  view.focus();
  syncRequiredArgumentVariables(
    requiredRootArgs
  );
}

  function handleArgumentClick(
    rootField: ExplorerField,
    argName: string,
    checked: boolean
  ) {
    const view =
      editorViewRef.current[
        "operation"
      ];

    const schema =
      schemaRef.current;

    if (!view || !schema) {
      return;
    }

    const rootFieldName =
      rootField.name;

    const fieldOperationType =
      getRootOperationType(
        schema,
        rootFieldName
      );

    if (!fieldOperationType) {
      return;
    }

    const syncClickedArgumentVariable = () => {
      requestAnimationFrame(() => {
        ensureVariableForRootArgument(
          rootFieldName,
          argName
        );
      });
    };

    const fullQuery =
      view.state.doc.toString();

    const cursorPos =
      view.state.selection.main.head;

    const currentOperation =
      getCurrentOperationByCursor(
        fullQuery,
        cursorPos
      );

    const operationRange =
      getOperationRangeForType(
        fullQuery,
        fieldOperationType,
        cursorPos
      );

    if (!checked) {
      const active =
        getActiveOperationText();

      if (
        !active ||
        active.type !==
          fieldOperationType
      ) {
        return;
      }

      const nextOperation =
        toggleRootArgumentInOperation(
          active.text,
          schema,
          rootFieldName,
          argName,
          false,
          fieldOperationType
        );

      const nextFullQuery =
        replaceOperationAtRange(
          fullQuery,
          active.start,
          active.end,
          nextOperation
        );

      view.dispatch({
        changes: {
          from: 0,
          to:
            view.state.doc.length,
          insert:
            nextFullQuery,
        },
        selection: {
          anchor:
            Math.min(
              active.start +
              Math.max(
                0,
                nextOperation.length - 1
              ),
              nextFullQuery.length
            ),
        },
      });

      view.focus();
      syncClickedArgumentVariable();

      return;
    }

    if (
      rootArgumentExistsInActiveOperation(
        rootFieldName,
        argName
      )
    ) {
      view.focus();
      return;
    }

    const createOperationWithArgument = () =>
      toggleRootArgumentInOperation(
        generateOperationForSelection(
          schema,
          rootFieldName,
          [],
          rootField,
          fullQuery
        ),
        schema,
        rootFieldName,
        argName,
        true,
        fieldOperationType
      );

    if (!fullQuery.trim()) {
      const generated =
        createOperationWithArgument();

      view.dispatch({
        changes: {
          from: 0,
          to:
            view.state.doc.length,
          insert:
            generated,
        },
        selection: {
          anchor:
            Math.max(
              0,
              generated.length - 1
            ),
        },
      });

      view.focus();
      syncClickedArgumentVariable();

      return;
    }

    if (
      currentOperation.operationType &&
      currentOperation.operationType !==
        fieldOperationType
    ) {
      const newOperation =
        createOperationWithArgument();

      const nextQuery =
        insertOperationBelow(
          fullQuery,
          currentOperation.operationEnd,
          newOperation
        );

      const newOperationStart =
        currentOperation.operationEnd +
        2;

      view.dispatch({
        changes: {
          from: 0,
          to:
            view.state.doc.length,
          insert:
            nextQuery,
        },
        selection: {
          anchor:
            newOperationStart +
            Math.max(
              0,
              newOperation.length - 1
            ),
        },
      });

      view.focus();
      syncClickedArgumentVariable();

      return;
    }

    if (!operationRange) {
      const generated =
        createOperationWithArgument();

      const inserted =
        insertOperationAtCursor(
          fullQuery,
          cursorPos,
          generated
        );

      view.dispatch({
        changes: {
          from: 0,
          to:
            view.state.doc.length,
          insert:
            inserted.nextQuery,
        },
        selection: {
          anchor:
            inserted.operationStart +
            Math.max(
              0,
              generated.length - 1
            ),
        },
      });

      view.focus();
      syncClickedArgumentVariable();

      return;
    }

    const operationText =
      fullQuery.slice(
        operationRange.start,
        operationRange.end
      );

    const nextOperation =
      toggleRootArgumentInOperation(
        operationText,
        schema,
        rootFieldName,
        argName,
        true,
        fieldOperationType
      );

    const nextFullQuery =
      replaceOperationAtRange(
        fullQuery,
        operationRange.start,
        operationRange.end,
        nextOperation
      );

    view.dispatch({
      changes: {
        from: 0,
        to:
          view.state.doc.length,
        insert:
          nextFullQuery,
      },
      selection: {
        anchor:
          operationRange.start +
          Math.max(
            0,
            nextOperation.length - 1
          ),
      },
    });

    view.focus();
    syncClickedArgumentVariable();
  }


  return (
    <div className='w-full flex-1 flex min-h-0'>
      {/* left menu */}
      <div className='w-[50px] h-full bg-black-1 border-r border-r-gray-2 flex flex-col items-center'>
        <div className='w-full border-l-[3px] border-l-green-1 h-[48px] flex justify-center items-center'>
          <RxFileTextIcon size={28} className='mr-1 text-white/80' />
        </div>
        <div className='w-full h-[48px] flex justify-center items-center'>
          <BiCollectionIcon size={28} className='mr-1 text-white/30' />
        </div>
        <div className='w-full h-[48px] flex justify-center items-center'>
          <CiCloudOnIcon strokeWidth={0.5} size={28} className='mr-1 text-white/30' />
        </div>
      </div>
      {/* body */}
      <Group orientation="horizontal" className="h-full min-h-0">
        <Panel defaultSize={"350px"} minSize={"280px"} className='flex flex-col min-h-0'>
          <div className="flex-1 bg-black-1 flex flex-col min-h-0">
            <div className='p-2.5'>
              <div className='w-full rounded-md outline outline-1 outline-gray-1/50 bg-gray-3 flex pl-2 gap-0.5'>
                <div className={`w-2.5 h-2.5 min-w-2.5 min-h-2.5 rounded-full my-auto ${
                  schemaStatus === "error"
                    ? "bg-red-500"
                    : "bg-green-1"
                }`}></div>
                <input value={lastEndpoint} onChange={e => { dispatch(setEndpoint(e.target.value)) }} spellCheck={false} className='w-full rounded-sm p-2 bg-gray-3 outline-none' placeholder='Enter URL' />
              </div>
            </div>
            <div className='relative w-full flex justify-between mt-3 px-2.5'>
              <p className='text-lg my-auto leading-4 font-semibold'>Documentation</p>
              <button
                type="button"
                onClick={() =>
                  setDocumentationSearchOpen(
                    true
                  )
                }
                className="
                  inline-flex h-8 w-8 items-center justify-center rounded-[4px]
                  text-white/70 transition-colors hover:bg-white/10 hover:text-white
                "
              >
                <Search strokeWidth={2} size={20} />
              </button>
            </div>
            {documentationSearchOpen && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5"
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) {
                    setDocumentationSearchOpen(false);
                    setDocumentationSearchKeyword("");
                  }
                }}
              >
                <div className="w-[680px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 shadow-2xl">
                  <div className="flex items-center gap-3 border-b border-b-gray-2 px-4 py-3">
                    <Search size={17} className="text-white/45" />
                    <input
                      autoFocus
                      value={
                        documentationSearchKeyword
                      }
                      onChange={(event) =>
                        setDocumentationSearchKeyword(
                          event.target.value
                        )
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key ===
                          "Escape"
                        ) {
                          setDocumentationSearchOpen(
                            false
                          );
                          setDocumentationSearchKeyword(
                            ""
                          );
                        }
                      }}
                      spellCheck={false}
                      className="h-10 flex-1 bg-transparent text-base text-white outline-none placeholder:text-white/35"
                      placeholder="Search API"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setDocumentationSearchOpen(
                          false
                        );
                        setDocumentationSearchKeyword(
                          ""
                        );
                      }}
                      className="rounded-[4px] px-2 py-1 text-xs font-semibold text-white/45 hover:bg-white/10 hover:text-white"
                    >
                      Esc
                    </button>
                  </div>

                  <OverlayScrollbarsComponent
                    className="max-h-[520px] px-2 py-3"
                    options={overlayScrollOptions}
                    defer
                  >
                    {([
                      "Query",
                      "Mutation",
                    ] as const).map(
                      (operationType) => {
                        const results =
                          getDocumentationSearchResults(
                            operationType
                          );

                        return (
                          <div
                            key={
                              operationType
                            }
                            className="px-2 pb-4"
                          >
                            <div className="pb-2 text-left text-sm font-medium uppercase tracking-wide text-green-1">
                              {operationType.toLowerCase()} result
                            </div>
                            {results.length > 0 ? (
                              results.map(
                                (field) => (
                                  <button
                                    key={`${operationType}-${field.name}`}
                                    type="button"
                                    onClick={() =>
                                      openRootOperationFromSearch(
                                        operationType,
                                        field
                                      )
                                    }
                                    className="flex w-full items-center justify-between gap-4 rounded-[4px] px-3 py-2 text-left text-base text-white/80 hover:bg-gray-2/50 hover:text-white"
                                  >
                                    <span className="min-w-0 truncate">
                                      {field.name}
                                    </span>
                                    <span className="shrink-0 truncate text-sm text-[#5B8DBD]">
                                      {field.type}
                                    </span>
                                  </button>
                                )
                              )
                            ) : (
                              <div className="px-2 py-1 text-sm text-white/30">
                                No result
                              </div>
                            )}
                          </div>
                        );
                      }
                    )}
                  </OverlayScrollbarsComponent>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-1 my-3 text-lg px-1 text-wrap wrap-break-word gap-y-0">
              {stack.map(
                (
                  item,
                  index
                ) => (
                  <React.Fragment
                    key={
                      index
                    }
                  >
                    {index >
                      0 && (
                        <span className="text-[#475569]">
                          /
                        </span>
                      )}

                    <button
                      onClick={() =>
                        goToBreadcrumb(
                          index
                        )
                      }
                      className={`
                        px-1.5
                        rounded
                        text-green-1
                        transition-colors
                        hover:bg-[#ffffff10]
                        text-wrap wrap-break-word truncate
                      `}
                    >
                      {item.fieldName ??
                        item.typeName}
                    </button>
                  </React.Fragment>
                )
              )}
            </div>
            <div className='relative flex-1 flex flex-col min-h-0 !overflow-y-clip bg-black-1'>
              {
                !currentType &&
                  <div className='w-full min-h-0'>
                    {
                      ("Query" in explorerSchema) &&
                        <FieldGroup onClick={() => openRootType("Query")} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/30 group">
                          <Field orientation="horizontal">
                            <Checkbox
                              checked={rootOperations.query}
                              onCheckedChange={(checked) => {
                                setRootOperation("query", !!checked);
                              }}
                              strokeWidth={5} id="queries" name="queries" className='data-[state=checked]:bg-green-1/70 w-5 h-5 transition-none! border-white/50 text-white/80 text-lg text-bold!' />
                            <FieldLabel className='w-full flex justify-between'>
                              <p className='-ml-2 my-auto text-lg font-medium text-nowrap overflow-hidden'>query: <span className='text-[#5B8DBD]'>Query</span></p>
                              <ArrowRight size={20} className='group-hover:block hidden' />
                            </FieldLabel>
                          </Field>
                        </FieldGroup>
                    }
                    {
                      ("Mutation" in explorerSchema) &&
                        <FieldGroup onClick={() => openRootType("Mutation")} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/30 group">
                          <Field orientation="horizontal">
                            <Checkbox
                              checked={rootOperations.mutation}
                              onCheckedChange={(checked) => {
                                setRootOperation("mutation", !!checked);

                                if (checked) {
                                  setCurrentType("Mutation");
                                }
                              }}
                              strokeWidth={5} id="mutations" name="mutations" className='data-[state=checked]:bg-green-1/70 w-5 h-5 transition-none! border-white/50 text-white/80 text-lg text-bold!' />
                            <FieldLabel className='w-full flex justify-between'>
                              <p className='-ml-2 text-lg font-medium text-nowrap overflow-hidden'>mutation: <span className='text-[#5B8DBD]'>Mutation</span></p>
                              <ArrowRight size={20} className='group-hover:block hidden' />
                            </FieldLabel>
                          </Field>
                        </FieldGroup>
                    }
                  </div>
              }
              {showOperationInfo && (
                <div className="mb-8">
                  {/* operation name */}
                  <div className="flex ml-3 items-start text-left gap-3 mt-2">
                    <Checkbox
                      checked={
                        !!selectedField &&
                        selectionExistsInActiveOperation(
                          selectedField.name,
                          [],
                          selectedField.name
                        )
                      }
                      onCheckedChange={(checked) => {
                        if (selectedField) {
                          handleFieldClick(
                            selectedField.name,
                            [],
                            selectedField,
                            checked === true
                          );
                        }
                      }}
                      strokeWidth={5} id="mutations" name="mutations" className='data-[state=checked]:bg-green-1/70 w-5 h-5 my-auto transition-none! border-white/50 text-white/80 text-lg text-bold!'
                    />
                    <div className="min-w-0 text-lg flex flex-wrap gap-y-0 gap-2 font-semibold text-white break-words">
                      <span className="min-w-0 break-all">
                        {
                          selectedField.name
                        }:
                      </span>
                      <div className="min-w-0 text-lg text-[#5B8DBD] break-all">
                        {
                          selectedField.type
                        }
                      </div>
                    </div>
                  </div>

                  {/* description */}
                  {selectedField.description && (
                    <div className="mt-2 text-sm text-[#94a3b8]">
                      {
                        selectedField.description
                      }
                    </div>
                  )}

                  {/* args */}
                  <div className="mt-5">
                    <div className="text-lg ml-3 font-bold text-left tracking-wide text-white mb-2">
                      Arguments
                    </div>

                    {selectedField.args
                      .length ===
                      0 ? (
                      <div className="text-base text-[#64748b]">
                        No arguments
                      </div>
                    ) : (
                      <div>
                        {selectedField.args.map(
                          (
                            arg
                          ) => (
                            <FieldGroup key={arg.name} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/30 group">
                              <Field orientation="horizontal">
                                <div onClick={(event) => event.stopPropagation()}>
                                  <Checkbox
                                    checked={
                                      !!selectedField &&
                                      rootArgumentExistsInActiveOperation(
                                        selectedField.name,
                                        arg.name
                                      )
                                    }
                                    onCheckedChange={(checked) => {
                                      if (!selectedField) {
                                        return;
                                      }

                                      handleArgumentClick(
                                        selectedField,
                                        arg.name,
                                        checked === true
                                      );
                                    }}
                                    strokeWidth={5} id={`arg-${selectedField.name}-${arg.name}`} name={`arg-${selectedField.name}-${arg.name}`} className='data-[state=checked]:bg-green-1/70 w-5 h-5 transition-none! border-white/50 text-white/80 text-lg text-bold!' 
                                  />
                                </div>
                                <FieldLabel className='w-full min-w-0 text-left'>
                                  <div className='min-w-0 text-left'>
                                    <p className='text-lg font-medium whitespace-normal break-words'>
                                      {arg.name}: <span className='text-[#5B8DBD]'>{arg.type}</span>
                                      <span className='text-[#feba99]'> = {formatExplorerArgumentDefaultDisplay(arg)}</span>
                                    </p>
                                    {arg.description && (
                                      <p className='mt-0.5 text-sm leading-5 text-[#94a3b8] whitespace-normal break-words'>
                                        {arg.description}
                                      </p>
                                    )}
                                  </div>
                                </FieldLabel>
                              </Field>
                            </FieldGroup>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {
                currentType &&
                  <OverlayScrollbarsComponent
                    ref={scrollRef}
                    className='w-full min-h-0 flex-1 bg-black-1'
                    options={overlayScrollOptions}
                    defer
                  >
                    <div className="ml-2.5 text-lg font-bold text-left tracking-wide text-white mb-2">
                      Fields
                    </div>
                    {
                      filteredFields.map((field) => {
                        const expandable =
                          field.kind ===
                          "object" ||
                          field.kind ===
                          "interface" ||
                          field.kind ===
                          "union";
                        const isRootType =
                          currentType === "Query" ||
                          currentType === "Mutation";
                        const rootFieldName =
                          isRootType
                            ? field.name
                            : stack[2]?.fieldName;
                        const targetPath =
                          isRootType
                            ? []
                            : stack.slice(3).map((s) => s.fieldName!).filter(Boolean);
                        const checked =
                          !!rootFieldName &&
                          selectionExistsInActiveOperation(
                            rootFieldName,
                            targetPath,
                            field.name
                          );
                        return (
                          <FieldGroup key={field.name} onClick={() => openField( field )} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/30 group">
                            <Field orientation="horizontal">
                              <div onClick={(event) => event.stopPropagation()}>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(nextChecked) => {
                                    if (!rootFieldName) {
                                      return;
                                    }

                                    handleFieldClick(
                                      rootFieldName,
                                      targetPath,
                                      field,
                                      nextChecked === true
                                    );
                                  }}
                                  strokeWidth={5} id={`field-${currentType}-${field.name}`} name={`field-${currentType}-${field.name}`} className='data-[state=checked]:bg-green-1/70 w-5 h-5 transition-none! border-white/50 text-white/80 text-lg text-bold!' 
                                />
                              </div>
                              <FieldLabel className='w-full min-w-0 flex justify-between gap-2 text-left'>
                                <div className='min-w-0 text-left'>
                                  <p className='text-lg font-medium text-nowrap overflow-hidden truncate'>{field.name}: <span className='text-[#5B8DBD]'>{field.type}</span></p>
                                  {field.description && (
                                    <p className='mt-0.5 text-sm leading-5 text-[#94a3b8] whitespace-normal break-words'>
                                      {field.description}
                                    </p>
                                  )}
                                </div>
                                { expandable && <ArrowRight size={20} className='group-hover:block hidden shrink-0 mt-1' /> }
                              </FieldLabel>
                            </Field>
                          </FieldGroup>
                        )
                      })
                    }
                  </OverlayScrollbarsComponent>
              }
              
            </div>
          </div>
        </Panel>

        <Separator
          className="
            group
            relative
            w-px
            bg-transparent
            cursor-col-resize
            overflow-visible
            border-r border-r-gray-2
          "
        >
          <div
            className="
              absolute
              inset-y-0
              left-1/2
              -translate-x-1/2
              w-[6px]
              bg-green-1
              opacity-0
              transition-opacity
              z-20
              group-data-[separator=active]:opacity-100
            "
          />
        </Separator>

        <Panel minSize={"350px"} className='flex flex-col min-h-0'>
          <div className="bg-black-2 h-[50px]">Cột phải</div>
          <Group orientation="horizontal" className="flex-1 min-h-0">
            <Panel defaultSize={"50%"} minSize={"300px"} className='min-h-0'>
              <Group orientation="vertical" className="h-full min-h-0">
                <Panel defaultSize={"450px"} minSize={"50px"} className='flex flex-col min-h-0 overflow-hidden'>
                  {/* body */}
                  <div className="bg-black-1">
                    <div className="flex items-center justify-between px-3 pt-3 pb-1 border-t border-t-gray-2 flex-shrink-0">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold">Operation</span>
                      </div>
                      <button
                        type="button"
                        disabled={
                          !canRunOperation ||
                          isRunningOperation
                        }
                        onClick={runActiveOperation}
                        className={`
                          inline-flex items-center gap-2 rounded-[4px] px-4 py-1
                          font-semibold transition-colors
                          ${canRunOperation && !isRunningOperation
                            ? "bg-green-1/70 text-white hover:bg-green-1 cursor-pointer"
                            : "bg-green-1/25 text-white/45 cursor-default"
                          }
                        `}
                      >
                        <BiCaretRightIcon size={20} />
                        {isRunningOperation ? "Running" : "Run"}
                      </button>
                    </div>
                  </div>
                  <div className="relative flex-1 min-h-0 text-left" ref={editorDomRef} />
                </Panel>

                <Separator
                  className="
                    group
                    relative
                    h-px
                    bg-transparent
                    cursor-row-resize
                    overflow-visible
                    border-t border-t-gray-2
                  "
                >
                  <div
                    className="
                      absolute
                      inset-x-0
                      top-1/2
                      -translate-y-1/2
                      h-[6px]
                      bg-green-1
                      opacity-0
                      transition-opacity

                      group-data-[separator=active]:opacity-100
                    "
                  />
                </Separator>

                <Panel minSize={"50px"} className='flex flex-col min-h-0'>
                  <div className="bg-black-1 flex flex-col flex-1 min-h-0">
                    <div className="flex h-[38px] shrink-0 items-center border-b border-b-gray-2 px-2">
                      <button
                        type="button"
                        onClick={() => setRequestConfigTab("variables")}
                        className={`
                          h-full px-3 text-sm font-semibold uppercase tracking-wide
                          border-b-2 transition-colors
                          ${requestConfigTab === "variables"
                            ? "border-green-1 text-white"
                            : "border-transparent text-white/45 hover:text-white/75"
                          }
                        `}
                      >
                        Variables
                      </button>
                      <button
                        type="button"
                        onClick={() => setRequestConfigTab("headers")}
                        className={`
                          h-full px-3 text-sm font-semibold uppercase tracking-wide
                          border-b-2 transition-colors
                          ${requestConfigTab === "headers"
                            ? "border-green-1 text-white"
                            : "border-transparent text-white/45 hover:text-white/75"
                          }
                        `}
                      >
                        Headers
                      </button>
                    </div>
                    <div className="relative flex-1 min-h-0 text-left">
                      <div
                        className={`
                          absolute inset-0 min-h-0
                          ${requestConfigTab === "variables"
                            ? "opacity-100 pointer-events-auto"
                            : "opacity-0 pointer-events-none"
                          }
                        `}
                        ref={variablesDomRef}
                      />
                      <div
                        className={`
                          absolute inset-0 min-h-0
                          ${requestConfigTab === "headers"
                            ? "opacity-100 pointer-events-auto"
                            : "opacity-0 pointer-events-none"
                          }
                        `}
                        ref={headersDomRef}
                      />
                    </div>
                  </div>
                </Panel>
              </Group>
            </Panel>

            <Separator
              className="
                group
                relative
                w-px
                bg-transparent
                cursor-col-resize
                overflow-visible
                border-r border-r-gray-2
              "
            >
              <div
                className="
                  absolute
                  inset-y-0
                  left-1/2
                  -translate-x-1/2
                  w-[6px]
                  bg-green-1
                  opacity-0
                  transition-opacity

                  group-data-[separator=active]:opacity-100
                "
              />
            </Separator>

            <Panel minSize={"100px"} className='flex flex-col min-h-0'>
              <div className="bg-black-1 flex flex-col flex-1 min-h-0 border-t border-t-gray-2">
                <div className="flex h-[38px] shrink-0 items-center justify-between border-b border-b-gray-2 px-3">
                  <span className="text-sm font-semibold uppercase tracking-wide text-white/70">
                    Response
                  </span>
                  <button
                    type="button"
                    onClick={copyResponseToClipboard}
                    className="
                      inline-flex h-7 w-7 items-center justify-center rounded-[4px]
                      text-white/55 transition-colors hover:bg-white/10 hover:text-white
                    "
                    title="Copy response"
                  >
                    {responseCopied ? (
                      <Check size={16} />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>
                <div
                  className="relative flex-1 min-h-0 text-left"
                  ref={resultDomRef}
                />
              </div>
            </Panel>
          </Group>
        </Panel>
      </Group>
    </div>
  );
};

export default Home;
