import React, { createElement, useCallback, useEffect, useRef, useState } from 'react';
import 'overlayscrollbars/styles/overlayscrollbars.css';
import { OverlayScrollbarsComponent } from 'overlayscrollbars-react';
import { BiCaretRight, BiCollection } from "react-icons/bi";
import { RxFileText } from "react-icons/rx";
import { CiCloudOn } from "react-icons/ci";
import { Group, Panel, Separator } from "react-resizable-panels";
import { ArrowRight, Bug, Check, ChevronDown, ChevronRight, Clock, CloudCheck, CloudDownload, CloudOff, CloudUpload, Copy, Database, Download, Edit3, FileText, Pin, Plus, Search, Settings, Upload, X } from 'lucide-react';
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
import { SendRequest, StartSubscription, StopSubscription } from "../../../wailsjs/go/services/CallAPIService";
import { EventsOn } from "../../../wailsjs/runtime/runtime";
import {
  DeleteCollection,
  DeleteFolder,
  ListSavedAPIs,
  ListSavedCollections,
  RenameCollection,
  RenameFolder,
  SaveCollection,
  SaveFolder,
  SaveSavedAPI,
  MoveFolder,
  DeleteSavedAPI,
  CheckGoogleDriveSyncStatus,
  GetCloudSyncState,
  GetGoogleDriveConfig,
  LoadEnvironmentStore,
  OpenBugReportAttachmentFile,
  OpenJSONFile,
  PullWorkspacesFromGoogleDrive,
  RenameSavedAPI,
  RequestGoogleDriveAccess,
  SaveEnvironmentStore,
  SaveGoogleDriveConfig,
  SaveJSONFile,
  SyncAllWorkspacesToGoogleDrive,
  SubmitBugReport,
} from "../../../wailsjs/go/main/App";
import { Checkbox } from '../../components/ui/checkbox';
import { Field, FieldGroup, FieldLabel } from "../../components/ui/field";
import { EditorState, Extension, Prec, RangeSetBuilder, StateField } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, foldService, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { renderToStaticMarkup } from "react-dom/server";
import { autocompletion, CompletionContext, completionKeymap, closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
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

type RequestConfigTab =
  | "variables"
  | "headers";

type ResponsePanelTab =
  | "body"
  | "cookies"
  | "headers";

type ResponseCookieItem = {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: string;
  httpOnly: boolean;
  secure: boolean;
};

type WorkspaceTab = {
  id: string;
  title: string;
  savedApiId?: string;
  collection?: string;
  folder?: string;
  operation: string;
  variables: string;
  headers: string;
  response: string;
  requestConfigTab: RequestConfigTab;
  responsePanelTab: ResponsePanelTab;
  responseStatusCode?: number;
  responseStatus?: string;
  responseHeaders: Record<string, string>;
  responseCookies: ResponseCookieItem[];
  responseDuration?: number;
  responseSize?: number;
  subscriptionId?: string;
  subscriptionListening?: boolean;
  pinned?: boolean;
  cursorPosition?: number;
  isDirty: boolean;
};

type SavedAPIItem = {
  id: string;
  name: string;
  collection: string;
  folder: string;
  endpoint: string;
  query: string;
  variables: string;
  headers: string;
  updatedAt: number;
};

type SavedFolderItem = {
  name: string;
  folders: SavedFolderItem[];
};

type SavedCollectionItem = {
  name: string;
  folders: SavedFolderItem[];
};

type EnvironmentVariable = {
  id: string;
  key: string;
  value: string;
};

type EnvironmentItem = {
  id: string;
  name: string;
  variables: EnvironmentVariable[];
};

type EnvironmentStorePayload = {
  activeEnvironmentId: string;
  environments: EnvironmentItem[];
};

type AppToast = {
  id: string;
  type: "success" | "error";
  message: string;
};

type CollectionExportPayload = {
  type: "graph-space-collection";
  version: 1;
  collection: SavedCollectionItem;
  apis: SavedAPIItem[];
};

type CloudSyncState = {
  status: string;
  message: string;
  updatedAt: number;
  localVersion: number;
  cloudVersion: number;
};

type GoogleDriveConfigView = {
  clientId: string;
  clientSecretSet: boolean;
  redirectPort: number;
  lockTTLSecond: number;
  accountEmail?: string;
};

const bugReportTagOptions = [
  {
    id: "1508684326659690566",
    label: "UI",
  },
  {
    id: "1508684372025413663",
    label: "Critical bug",
  },
  {
    id: "1508684518586974258",
    label: "General bug",
  },
];

type CollectionContextMenu =
  | {
    type: "collection";
    collection: string;
    x: number;
    y: number;
  }
  | {
    type: "folder";
    collection: string;
    folderPath: string;
    name: string;
    x: number;
    y: number;
  }
  | {
    type: "api";
    api: SavedAPIItem;
    x: number;
    y: number;
  };

type TabContextMenu = {
  tabId: string;
  x: number;
  y: number;
};

const createWorkspaceTab = (
  index: number
): WorkspaceTab => ({
  id: `workspace-${Date.now()}-${index}`,
  title: `Query ${index}`,
  operation: "",
  variables: "{}",
  headers: "{}",
  response: "",
  requestConfigTab: "variables",
  responsePanelTab: "body",
  responseHeaders: {},
  responseCookies: [],
  isDirty: false,
});

const workspaceSessionStorageKey =
  "graph-space-workspace-session-v1";

type WorkspaceSessionState = {
  workTabs: WorkspaceTab[];
  activeWorkTabId: string;
};

function loadWorkspaceSessionState(): WorkspaceSessionState | null {
  try {
    const raw =
      window.localStorage.getItem(
        workspaceSessionStorageKey
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(raw) as WorkspaceSessionState;

    if (
      !Array.isArray(parsed.workTabs) ||
      parsed.workTabs.length === 0
    ) {
      return null;
    }

    return {
      ...parsed,
      workTabs:
        parsed.workTabs.map((tab) => ({
          ...createWorkspaceTab(1),
          ...tab,
          subscriptionId:
            undefined,
          subscriptionListening:
            false,
        })),
    };
  } catch {
    return null;
  }
}

function saveWorkspaceSessionState(
  state: WorkspaceSessionState
) {
  try {
    window.localStorage.setItem(
      workspaceSessionStorageKey,
      JSON.stringify(state)
    );
  } catch {
    return;
  }
}

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
  const lastEndpointErrorToastRef = useRef("");
  const editorViewRef = useRef<Record<string, EditorView>>({});
  const schemaRef = useRef<GraphQLSchema | null>(null);
  const [endpointDraft, setEndpointDraft] = useState(lastEndpoint);
  const [canRunOperation, setCanRunOperation] = useState(false);
  const [isRunningOperation, setIsRunningOperation] = useState(false);
  const [responseCopied, setResponseCopied] = useState(false);
  const [sidebarMode, setSidebarMode] = useState<"documentation" | "collections" | "saved-api">("documentation");
  const [savedAPIs, setSavedAPIs] = useState<SavedAPIItem[]>([]);
  const [savedCollections, setSavedCollections] = useState<SavedCollectionItem[]>([]);
  const [expandedCollections, setExpandedCollections] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [selectedSavedAPIId, setSelectedSavedAPIId] = useState<string | null>(null);
  const [selectedCollectionTarget, setSelectedCollectionTarget] = useState({
    collection: "Default",
    folder: "",
  });
  const [savedAPIClipboard, setSavedAPIClipboard] = useState<{
    apiId: string;
    mode: "copy" | "cut";
  } | null>(null);
  const [collectionSearchKeyword, setCollectionSearchKeyword] = useState("");
  const [activeSavedAPI, setActiveSavedAPI] = useState<SavedAPIItem | null>(null);
  const [closeConfirmTabId, setCloseConfirmTabId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{
    collection: string;
    path: string;
    position: "before" | "inside" | "after";
  } | null>(null);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [savePickerExpandedCollections, setSavePickerExpandedCollections] = useState<string[]>([]);
  const [savePickerExpandedFolders, setSavePickerExpandedFolders] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<CollectionContextMenu | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<TabContextMenu | null>(null);
  const [isRunButtonHovered, setIsRunButtonHovered] = useState(false);
  const [appToasts, setAppToasts] = useState<AppToast[]>([]);
  const [environmentStore, setEnvironmentStore] = useState<EnvironmentStorePayload>({
    activeEnvironmentId: "",
    environments: [],
  });
  const [environmentMenuOpen, setEnvironmentMenuOpen] = useState(false);
  const environmentMenuRef = useRef<HTMLDivElement>(null);
  const [environmentEditorOpen, setEnvironmentEditorOpen] = useState(false);
  const [environmentSearch, setEnvironmentSearch] = useState("");
  const [environmentEditorDraft, setEnvironmentEditorDraft] = useState<EnvironmentItem | null>(null);
  const [cloudDialogOpen, setCloudDialogOpen] = useState(false);
  const [cloudSyncState, setCloudSyncState] = useState<CloudSyncState>({
    status: "idle",
    message: "",
    updatedAt: 0,
    localVersion: 0,
    cloudVersion: 0,
  });
  const [googleConfig, setGoogleConfig] = useState({
    clientId: "",
    clientSecret: "",
    clientSecretSet: false,
    accountEmail: "",
  });
  const [cloudSettingsOpen, setCloudSettingsOpen] = useState(false);
  const [cloudActionLoading, setCloudActionLoading] = useState<"pull" | "push" | null>(null);
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const [bugReportSubmitting, setBugReportSubmitting] = useState(false);
  const [bugReportDraft, setBugReportDraft] = useState({
    title: "",
    description: "",
    deviceOs: "",
    tags: [] as string[],
    attachments: [] as Array<{
      path: string;
      name: string;
      size: number;
      contentType: string;
    }>,
  });
  const [cookieColumnWidths, setCookieColumnWidths] = useState([180, 260, 180, 120, 220, 110, 100]);
  const [headerColumnWidths, setHeaderColumnWidths] = useState([220, 420]);
  const [collectionDialog, setCollectionDialog] = useState({
    open: false,
    mode: "create" as "create" | "rename",
    oldName: "",
    name: "",
  });
  const [folderDialog, setFolderDialog] = useState({
    open: false,
    mode: "create" as "create" | "rename",
    collection: "Default",
    parentPath: "",
    folderPath: "",
    name: "",
  });
  const [apiDialog, setApiDialog] = useState({
    open: false,
    apiId: "",
    name: "",
  });
  const [saveDialogDraft, setSaveDialogDraft] = useState({
    name: "",
    collection: "Default",
    folder: "",
  });
  const [selectedTreeItemIds, setSelectedTreeItemIds] = useState<string[]>([]);
  const [lastSelectedTreeItemId, setLastSelectedTreeItemId] = useState<string | null>(null);
  const [workTabs, setWorkTabs] = useState<WorkspaceTab[]>(() =>
    loadWorkspaceSessionState()?.workTabs ?? [
      createWorkspaceTab(1),
    ]
  );
  const [activeWorkTabId, setActiveWorkTabId] = useState(() =>
    loadWorkspaceSessionState()?.activeWorkTabId ||
    workTabs[0].id
  );

  const activeWorkTab =
    workTabs.find(
      (tab) =>
        tab.id ===
        activeWorkTabId
    ) ?? workTabs[0] ?? null;

  const activeEnvironment =
    environmentStore.environments.find(
      (environment) =>
        environment.id ===
        environmentStore.activeEnvironmentId
    ) ?? null;

  const editingEnvironment =
    environmentEditorDraft;

  const environmentVariables =
    activeEnvironment?.variables.filter(
      (variable) =>
        variable.key.trim()
    ) ?? [];

  const googleDriveConnected =
    ![
      "not_logged_in",
      "idle",
      "error",
    ].includes(cloudSyncState.status);

  const environmentVariablesRef =
    useRef<EnvironmentVariable[]>([]);

  const existingCollections =
    savedCollections
      .map((collection) => collection.name)
      .sort((a, b) => a.localeCompare(b));

  const existingFolders =
    getFolderPathOptions(
      savedCollections.find(
        (collection) =>
          collection.name ===
          saveDialogDraft.collection
      )?.folders ?? []
    );

  const updateWorkTab = useCallback(
    (
      tabId: string,
      patch:
        | Partial<WorkspaceTab>
        | ((
          tab: WorkspaceTab
        ) => Partial<WorkspaceTab>)
    ) => {
      setWorkTabs((currentTabs) =>
        currentTabs.map((tab) =>
          tab.id === tabId
            ? {
              ...tab,
              ...(typeof patch === "function"
                ? patch(tab)
                : patch),
            }
            : tab
        )
      );
    },
    []
  );

  function getWorkspaceSessionSnapshot(): WorkspaceSessionState {
    const operationView =
      editorViewRef.current["operation"];

    const nextTabs =
      workTabs.map((tab) =>
        tab.id === activeWorkTabId
          ? {
            ...tab,
            operation:
              getEditorText("operation") || tab.operation,
            variables:
              getEditorText("variables") || tab.variables,
            headers:
              getEditorText("headers") || tab.headers,
            response:
              getEditorText("result") || tab.response,
            cursorPosition:
              operationView?.state.selection.main.head ??
              tab.cursorPosition,
            subscriptionId:
              undefined,
            subscriptionListening:
              false,
          }
          : {
            ...tab,
            subscriptionId:
              undefined,
            subscriptionListening:
              false,
          }
      );

    return {
      workTabs:
        nextTabs,
      activeWorkTabId,
    };
  }

  useEffect(() => {
    const timeoutId =
      window.setTimeout(() => {
        saveWorkspaceSessionState(
          getWorkspaceSessionSnapshot()
        );
      }, 300);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [workTabs, activeWorkTabId]);

  useEffect(() => {
    const persistBeforeUnload = () => {
      saveWorkspaceSessionState(
        getWorkspaceSessionSnapshot()
      );
    };

    window.addEventListener(
      "beforeunload",
      persistBeforeUnload
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        persistBeforeUnload
      );
      persistBeforeUnload();
    };
  }, [workTabs, activeWorkTabId]);

  useEffect(() => {
    environmentVariablesRef.current =
      environmentVariables;
  }, [environmentVariables]);

  useEffect(() => {
    setEndpointDraft(lastEndpoint);
  }, [lastEndpoint]);

  useEffect(() => {
    const timeoutId =
      window.setTimeout(() => {
        if (endpointDraft !== lastEndpoint) {
          dispatch(setEndpoint(endpointDraft));
        }
      }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [dispatch, endpointDraft, lastEndpoint]);

  function showToast(
    type: AppToast["type"],
    message: string
  ) {
    const id =
      `${Date.now()}-${Math.random()}`;

    setAppToasts((items) => [
      ...items,
      {
        id,
        type,
        message,
      },
    ]);

    window.setTimeout(() => {
      setAppToasts((items) =>
        items.filter(
          (item) =>
            item.id !== id
        )
      );
    }, type === "success" ? 3200 : 5200);
  }

  function notifyEndpointConnectionError(
    message: string
  ) {
    const nextMessage =
      message.trim() ||
      "Cannot connect to the endpoint URL.";

    setSchemaStatus("error");
    schemaRef.current = null;
    setCanRunOperation(false);

    if (
      lastEndpointErrorToastRef.current ===
      nextMessage
    ) {
      return;
    }

    lastEndpointErrorToastRef.current =
      nextMessage;
    showToast(
      "error",
      nextMessage
    );
  }

  const scrollRef = useRef<any>(null);
  const tabScrollRef = useRef<any>(null);

  const overlayScrollOptions = {
    scrollbars: {
      theme: "os-theme-graph-space",
      autoHide: "leave",
      autoHideDelay: 120,
      clickScroll: true,
    },
  } as const;

  const tabScrollOptions = {
    scrollbars: {
      theme: "os-theme-graph-space-tabs",
      autoHide: "leave",
      autoHideDelay: 120,
      clickScroll: true,
    },
  } as const;

  const [rootOperations, setRootOperations] = useState<{
    query: boolean;
    mutation: boolean;
    subscription: boolean;
  }>({
    query: false,
    mutation: false,
    subscription: false,
  });

  async function refreshSavedAPIs() {
    try {
      const [apis, collections] =
        await Promise.all([
          ListSavedAPIs(),
          ListSavedCollections(),
        ]);

      setSavedAPIs(
        (apis ?? []) as SavedAPIItem[]
      );
      setSavedCollections(
        (collections ?? []) as SavedCollectionItem[]
      );
      GetCloudSyncState()
        .then((state) =>
          setCloudSyncState(
            state as CloudSyncState
          )
        )
        .catch(() => undefined);
    } catch {
      setSavedAPIs([]);
      setSavedCollections([]);
    }
  }

  const handleMoveFolder = async (
    srcCol: string,
    srcPath: string,
    destCol: string,
    destPath: string,
    dropPosition: string
  ) => {
    try {
      await MoveFolder({
        srcCollection: srcCol,
        srcPath: srcPath,
        destCollection: destCol,
        destPath: destPath,
        dropPosition: dropPosition,
      });
      await refreshSavedAPIs();
    } catch (err) {
      console.error("Failed to move folder:", err);
    }
  };

  useEffect(() => {
    refreshSavedAPIs();
  }, []);

  async function refreshEnvironmentStore() {
    try {
      const store =
        await LoadEnvironmentStore();

      setEnvironmentStore({
        activeEnvironmentId:
          store.activeEnvironmentId || "",
        environments:
          (store.environments || []) as EnvironmentItem[],
      });
    } catch {
      setEnvironmentStore({
        activeEnvironmentId: "",
        environments: [],
      });
    }
  }

  async function persistEnvironmentStore(
    store: EnvironmentStorePayload
  ) {
    setEnvironmentStore(store);
    await SaveEnvironmentStore(store as any);
  }

  async function refreshCloudState() {
    try {
      const state =
        await CheckGoogleDriveSyncStatus();

      setCloudSyncState(
        state as CloudSyncState
      );
    } catch {
      try {
        const state =
          await GetCloudSyncState();
        setCloudSyncState(
          state as CloudSyncState
        );
      } catch {
        setCloudSyncState((state) => ({
          ...state,
          status:
            "error",
          message:
            "Unable to check Google Drive sync status.",
        }));
      }
    }
  }

  async function refreshGoogleConfig() {
    try {
      const config =
        await GetGoogleDriveConfig();

      setGoogleConfig({
        clientId:
          (config as GoogleDriveConfigView).clientId || "",
        clientSecret:
          "",
        clientSecretSet:
          (config as GoogleDriveConfigView).clientSecretSet || false,
        accountEmail:
          (config as GoogleDriveConfigView).accountEmail || "",
      });
    } catch {
      setGoogleConfig({
        clientId: "",
        clientSecret: "",
        clientSecretSet: false,
        accountEmail: "",
      });
    }
  }

  useEffect(() => {
    refreshEnvironmentStore();
    refreshCloudState();
    refreshGoogleConfig();
  }, []);

  useEffect(() => {
    const closeMenu = () => {
      setContextMenu(null);
      setTabContextMenu(null);
    };

    window.addEventListener(
      "click",
      closeMenu
    );

    return () => {
      window.removeEventListener(
        "click",
        closeMenu
      );
    };
  }, []);

  useEffect(() => {
    if (!environmentMenuOpen) {
      return;
    }

    const closeEnvironmentMenu = (event: MouseEvent) => {
      const target =
        event.target as Node | null;

      if (
        target &&
        environmentMenuRef.current?.contains(target)
      ) {
        return;
      }

      setEnvironmentMenuOpen(false);
    };

    window.addEventListener(
      "mousedown",
      closeEnvironmentMenu
    );

    return () => {
      window.removeEventListener(
        "mousedown",
        closeEnvironmentMenu
      );
    };
  }, [environmentMenuOpen]);

  useEffect(() => {
    if (!settingsMenuOpen) {
      return;
    }

    const closeSettingsMenu = (event: MouseEvent) => {
      const target =
        event.target as Node | null;

      if (
        target &&
        settingsMenuRef.current?.contains(target)
      ) {
        return;
      }

      setSettingsMenuOpen(false);
    };

    window.addEventListener(
      "mousedown",
      closeSettingsMenu
    );

    return () => {
      window.removeEventListener(
        "mousedown",
        closeSettingsMenu
      );
    };
  }, [settingsMenuOpen]);

  useEffect(() => {
    const handleWorkspaceChanged = () => {
      refreshSavedAPIs();
      refreshCloudState();
    };

    window.addEventListener(
      "graph-space-workspace-changed",
      handleWorkspaceChanged
    );

    return () => {
      window.removeEventListener(
        "graph-space-workspace-changed",
        handleWorkspaceChanged
      );
    };
  }, []);

  // Load schema
  async function loadSchema() {
    if (!lastEndpoint.trim()) {
      setSchemaStatus("idle");
      schemaRef.current = null;
      setCanRunOperation(false);
      return;
    }

    try {
      // Thay fetch() bằng Go bridge
      const res = await SendRequest({
        url: resolveEnvironmentText(lastEndpoint),
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache",
        },
        body: JSON.stringify({ query: getIntrospectionQuery() }), // ✅ dùng hàm chuẩn của graphql-js
      });

      if (res.error) {
        notifyEndpointConnectionError(
          `Endpoint connection failed: ${res.error}`
        );
        return;
      }

      let json: any;

      try {
        json = JSON.parse(res.body);
      } catch {
        notifyEndpointConnectionError(
          "Endpoint returned an invalid JSON schema response."
        );
        return;
      }

      if (json.errors) {
        notifyEndpointConnectionError(
          `Endpoint schema error: ${JSON.stringify(json.errors)}`
        );
        return;
      }

      const introspectionSignature =
        JSON.stringify(json.data);

      setSchemaStatus("connected");
      lastEndpointErrorToastRef.current =
        "";

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
      setCurrentType((previousType) =>
        previousType &&
        explorer[previousType]
          ? previousType
          : null
      );
      setSelectedField((previousField) => {
        if (
          !previousField ||
          !currentType ||
          !explorer[currentType]
        ) {
          return null;
        }

        return explorer[currentType].fields.find(
          (field) =>
            field.name === previousField.name
        ) ?? null;
      });

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
    } catch (error: any) {
      notifyEndpointConnectionError(
        `Endpoint schema load failed: ${error?.message || String(error)}`
      );
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
    lastEndpointErrorToastRef.current =
      "";
    schemaRef.current = null;
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
      ".cm-env-variable": {
        color: "#f59e0b",
        backgroundColor: "#f59e0b20",
        borderRadius: "3px",
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

  const environmentVariableDecoration =
    Decoration.mark({
      class: "cm-env-variable",
    });

  function environmentCompletionSource(
    context: CompletionContext
  ) {
    const before =
      context.matchBefore(
        /\{\{[A-Za-z0-9_:-]*$/
      );

    if (!before) {
      return null;
    }

    return {
      from:
        before.from + 2,
      options:
        environmentVariablesRef.current.map(
          (variable) => ({
            label:
              variable.key,
            type:
              "variable",
            detail:
              variable.value,
            apply:
              `${variable.key}}}`,
          })
        ),
    };
  }

  function buildEnvironmentDecorations(
    state: EditorState
  ) {
    const builder =
      new RangeSetBuilder<Decoration>();

    const doc =
      state.doc.toString();

    const tokenRegex =
      /\{\{[A-Za-z0-9_:-]+\}\}/g;

    let match:
      | RegExpExecArray
      | null;

    while (
      (match = tokenRegex.exec(doc))
    ) {
      builder.add(
        match.index,
        match.index + match[0].length,
        environmentVariableDecoration
      );
    }

    return builder.finish();
  }

  const environmentHighlightField =
    StateField.define<DecorationSet>({
      create(state) {
        return buildEnvironmentDecorations(
          state
        );
      },
      update(deco, tr) {
        if (tr.docChanged) {
          return buildEnvironmentDecorations(
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
    if (!editorDomRef.current || !activeWorkTab) return;

    const mountedTabId =
      activeWorkTabId;

    const startState = EditorState.create({
      doc:
        activeWorkTab.operation,
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
        environmentHighlightField,
        createOperationListener(),
        EditorView.updateListener.of((update) => {
          if (
            !update.docChanged &&
            !update.selectionSet
          ) {
            return;
          }

          updateWorkTab(
            mountedTabId,
            {
              ...(update.docChanged
                ? {
                  operation:
                    update.state.doc.toString(),
                  isDirty:
                    true,
                }
                : {}),
              cursorPosition:
                update.state.selection.main.head,
            }
          );
        }),
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

    if (schemaRef.current) {
      updateSchema(
        view,
        schemaRef.current
      );
    }

    if (
      activeWorkTab.cursorPosition !== undefined &&
      activeWorkTab.cursorPosition <= view.state.doc.length
    ) {
      view.dispatch({
        selection: {
          anchor:
            activeWorkTab.cursorPosition,
        },
      });
    }

    syncExplorerCheckboxState(
      view
    );

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeSearchPanel(view);
      }
    };

    document.addEventListener("keydown", handleEsc);

    return () => {
      view.destroy();
      delete editorViewRef.current[
        "operation"
      ];
      document.removeEventListener("keydown", handleEsc);
    };
  }, [activeWorkTabId, buildLinter, updateWorkTab]);

  useEffect(() => {
    if (
      !activeWorkTab ||
      !variablesDomRef.current ||
      !headersDomRef.current ||
      !resultDomRef.current
    ) {
      return;
    }

    const mountedTabId =
      activeWorkTabId;

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
      environmentHighlightField,
      gqlDarkTheme,
      autocompletion({
        override: [
          environmentCompletionSource,
        ],
      }),
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
          doc:
            activeWorkTab.variables,
          extensions: [
            ...commonExtensions,
            EditorView.updateListener.of((update) => {
              if (!update.docChanged) {
                return;
              }

              updateWorkTab(
                mountedTabId,
                {
                  variables:
                    update.state.doc.toString(),
                  isDirty:
                    true,
                }
              );
            }),
          ],
        }),
        parent:
          variablesDomRef.current,
      });

    const headersView =
      new EditorView({
        state: EditorState.create({
          doc:
            activeWorkTab.headers,
          extensions: [
            ...commonExtensions,
            EditorView.updateListener.of((update) => {
              if (!update.docChanged) {
                return;
              }

              updateWorkTab(
                mountedTabId,
                {
                  headers:
                    update.state.doc.toString(),
                  isDirty:
                    true,
                }
              );
            }),
          ],
        }),
        parent:
          headersDomRef.current,
      });

    const resultView =
      new EditorView({
        state: EditorState.create({
          doc:
            activeWorkTab.response,
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
  }, [activeWorkTabId, updateWorkTab]);

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
      subscription: /^[ \t]*subscription\b/m.test(doc),
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

  function syncExplorerCheckboxState(
    view: EditorView
  ) {
    const operation =
      getOperationAtCursor(
        view
      );

    setCanRunOperation(
      operationCanRun(view)
    );

    const docOperations =
      getRootOperations(
        view
      );

    if (operation) {
      setRootOperations({
        query:
          operation.type ===
          "query",
        mutation:
          operation.type ===
          "mutation",
        subscription:
          operation.type ===
          "subscription",
      });
      return;
    }

    setRootOperations(
      docOperations
    );
  }

  function createOperationListener() {
    return EditorView.updateListener.of((update) => {
      if (
        !update.docChanged &&
        !update.selectionSet
      ) {
        return;
      }

      syncExplorerCheckboxState(
        update.view
      );
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
  function setRootOperation(type: "query" | "mutation" | "subscription", checked: boolean) {
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
        : type === "mutation"
          ? `mutation {\n  \n}`
          : `subscription {\n  \n}`;

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
      currentType === "Mutation" ||
      currentType === "Subscription";

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
    operationType: "Query" | "Mutation" | "Subscription",
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
    operationType: "Query" | "Mutation" | "Subscription"
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
    operationType?: "query" | "mutation" | "subscription"
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
  ): "query" | "mutation" | "subscription" | null {

    const queryType =
      schema.getQueryType();

    const mutationType =
      schema.getMutationType();
    const subscriptionType =
      schema.getSubscriptionType();

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

    if (
      subscriptionType
        ?.getFields?.()[
      rootFieldName
      ]
    ) {
      return "subscription";
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

    const mutationField =
      schema.getMutationType()
      ?.getFields?.()[
      rootFieldName
    ];

    if (mutationField) {
      return mutationField;
    }

    return schema.getSubscriptionType()
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
    operationType: "query" | "mutation" | "subscription",
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
    const tabFieldByEditorId:
      Record<
        string,
        keyof Pick<
          WorkspaceTab,
          "operation" | "variables" | "headers" | "response"
        >
      > = {
      operation: "operation",
      variables: "variables",
      headers: "headers",
      result: "response",
    };

    const tabField =
      tabFieldByEditorId[
      editorId
      ];

    if (tabField) {
      updateWorkTab(
        activeWorkTabId,
        {
          [tabField]:
            text,
        } as Partial<WorkspaceTab>
      );
    }

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

  function formatResponseBody(
    body: string
  ) {
    if (!body) {
      return "";
    }

    try {
      return JSON.stringify(
        JSON.parse(body),
        null,
        2
      );
    } catch {
      return body;
    }
  }

  function formatSubscriptionEvent(
    event: any
  ) {
    if (
      event?.type === "connected"
    ) {
      return JSON.stringify(
        {
          status:
            "listening",
        },
        null,
        2
      );
    }

    if (
      event?.type === "complete"
    ) {
      return JSON.stringify(
        {
          status:
            "disconnected",
        },
        null,
        2
      );
    }

    if (
      typeof event?.payload === "string"
    ) {
      return formatResponseBody(
        event.payload
      );
    }

    return JSON.stringify(
      event?.payload ?? event,
      null,
      2
    );
  }

  function startColumnResize(
    widths: number[],
    setWidths: React.Dispatch<React.SetStateAction<number[]>>,
    index: number,
    event: React.MouseEvent<HTMLDivElement>
  ) {
    event.preventDefault();
    event.stopPropagation();

    const startX =
      event.clientX;
    const startWidth =
      widths[index];

    const handleMouseMove = (
      moveEvent: MouseEvent
    ) => {
      const nextWidth =
        Math.max(
          80,
          startWidth +
            moveEvent.clientX -
            startX
        );

      setWidths((currentWidths) =>
        currentWidths.map((width, widthIndex) =>
          widthIndex === index
            ? nextWidth
            : width
        )
      );
    };

    const handleMouseUp = () => {
      window.removeEventListener(
        "mousemove",
        handleMouseMove
      );
      window.removeEventListener(
        "mouseup",
        handleMouseUp
      );
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor =
      "col-resize";
    document.body.style.userSelect =
      "none";
    window.addEventListener(
      "mousemove",
      handleMouseMove
    );
    window.addEventListener(
      "mouseup",
      handleMouseUp
    );
  }

  function formatResponseDuration(
    duration?: number
  ) {
    if (duration === undefined || duration === null || duration < 0) {
      return "";
    }

    if (duration < 1000) {
      return `${Math.round(duration)} ms`;
    }

    return `${(duration / 1000).toFixed(2)} s`;
  }

  function formatResponseSize(
    size?: number
  ) {
    if (size === undefined || size === null || size < 0) {
      return "";
    }

    if (size < 1024) {
      return `${size} B`;
    }

    if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(1)} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(2)} MB`;
  }

  function formatResponseStatus(
    statusCode?: number,
    status?: string
  ) {
    const statusText =
      status?.trim() ?? "";

    if (!statusCode) {
      return statusText;
    }

    if (
      statusText === String(statusCode) ||
      statusText.startsWith(`${statusCode} `)
    ) {
      return statusText;
    }

    return `${statusCode} ${statusText}`.trim();
  }

  function resolveEnvironmentText(
    text: string
  ) {
    return text.replace(
      /\{\{([A-Za-z0-9_:-]+)\}\}/g,
      (_match, key) =>
        environmentVariablesRef.current.find(
          (variable) =>
            variable.key === key
        )?.value ?? ""
    );
  }

  function resolveEnvironmentValue<T>(
    value: T
  ): T {
    if (typeof value === "string") {
      return resolveEnvironmentText(
        value
      ) as T;
    }

    if (Array.isArray(value)) {
      return value.map(
        (item) =>
          resolveEnvironmentValue(item)
      ) as T;
    }

    if (
      value &&
      typeof value === "object"
    ) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(
          ([key, item]) => [
            key,
            resolveEnvironmentValue(item),
          ]
        )
      ) as T;
    }

    return value;
  }

  function setActiveResponsePanelTab(
    tab: ResponsePanelTab
  ) {
    if (!activeWorkTab) {
      return;
    }

    updateWorkTab(
      activeWorkTab.id,
      {
        responsePanelTab:
          tab,
      }
    );
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

      if (!operation) {
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
    if (
      activeWorkTab?.subscriptionListening &&
      activeWorkTab.subscriptionId
    ) {
      await StopSubscription(
        activeWorkTab.subscriptionId
      );
      updateWorkTab(
        activeWorkTab.id,
        {
          subscriptionListening:
            false,
          subscriptionId:
            undefined,
        }
      );
      setIsRunButtonHovered(false);
      return;
    }

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

    const isSubscription =
      active.type ===
      "subscription";

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

    const previousResponseText =
      getEditorText("result");
    const previousScrollTop =
      editorViewRef.current[
        "result"
      ]?.scrollDOM.scrollTop ?? 0;

    setIsRunningOperation(true);

    if (isSubscription && activeWorkTab) {
      const subscriptionId =
        `${activeWorkTab.id}-${Date.now()}`;

      try {
        await StartSubscription({
          id:
            subscriptionId,
          url:
            resolveEnvironmentText(endpointDraft),
          headers: {
            ...resolveEnvironmentValue(requestHeaders),
            "Content-Type": "application/json",
          },
          query:
            active.text,
          variables:
            resolveEnvironmentValue(variables),
        } as any);

        updateWorkTab(
          activeWorkTab.id,
          {
            subscriptionId,
            subscriptionListening:
              true,
            response:
              "",
            responsePanelTab:
              "body",
            responseStatus:
              "Listening",
            responseStatusCode:
              undefined,
            responseHeaders:
              {},
            responseCookies:
              [],
            responseDuration:
              undefined,
            responseSize:
              undefined,
          }
        );
        setEditorText("result", "");
    } catch (error: any) {
        showToast(
          "error",
          `Subscription connection failed: ${error?.message || String(error)}`
        );
        const nextText =
          JSON.stringify(
            {
              errors: [
                {
                  message:
                    error?.message ||
                    String(error),
                },
              ],
            },
            null,
            2
          );
        updateWorkTab(
          activeWorkTab.id,
          {
            response:
              nextText,
          }
        );
        setEditorText(
          "result",
          nextText
        );
      } finally {
        setIsRunningOperation(false);
        setCanRunOperation(
          operationCanRun(view)
        );
      }
      return;
    }

    try {
      const res =
        await SendRequest({
          url: resolveEnvironmentText(endpointDraft),
          method: "POST",
          headers: {
            ...resolveEnvironmentValue(requestHeaders),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: active.text,
            variables:
              resolveEnvironmentValue(variables),
          }),
        });

      if (res.error) {
        showToast(
          "error",
          `Endpoint request failed: ${res.error}`
        );
        const nextText =
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
          );
        updateWorkTab(
          activeWorkTabId,
          {
            response:
              nextText,
            responseStatus:
              res.status,
            responseStatusCode:
              res.statusCode,
            responseHeaders:
              res.headers || {},
            responseCookies:
              res.cookies || [],
            responseDuration:
              res.duration,
            responseSize:
              res.size,
          }
        );
        setEditorText(
          "result",
          nextText
        );
        return;
      }

      const nextText =
        formatResponseBody(
          res.body
        );

      updateWorkTab(
        activeWorkTabId,
        {
          response:
            nextText,
          responseStatus:
            res.status,
          responseStatusCode:
            res.statusCode,
          responseHeaders:
            res.headers || {},
          responseCookies:
            res.cookies || [],
          responseDuration:
            res.duration,
          responseSize:
            res.size,
        }
      );

      setEditorText(
        "result",
        nextText
      );

      requestAnimationFrame(() => {
        const resultView =
          editorViewRef.current[
            "result"
          ];

        if (!resultView) {
          return;
        }

        resultView.scrollDOM.scrollTop =
          nextText === previousResponseText
            ? previousScrollTop
            : 0;
      });
    } catch (error: any) {
      const message =
        error?.message ||
        String(error);
      const nextText =
        JSON.stringify(
          {
            errors: [
              {
                message,
              },
            ],
          },
          null,
          2
        );

      showToast(
        "error",
        `Endpoint request failed: ${message}`
      );
      updateWorkTab(
        activeWorkTabId,
        {
          response:
            nextText,
          responseStatus:
            "Request failed",
          responseStatusCode:
            undefined,
          responseHeaders:
            {},
          responseCookies:
            [],
        }
      );
      setEditorText(
        "result",
        nextText
      );
    } finally {
      setIsRunningOperation(false);
      setCanRunOperation(
        operationCanRun(view)
      );
    }
  }

  useEffect(() => {
    const unsubscribe =
      EventsOn(
        "graphql-subscription-event",
        (event: any) => {
          const subscriptionId =
            event?.id;

          if (!subscriptionId) {
            return;
          }

          const nextText =
            formatSubscriptionEvent(
              event
            );
          const isTerminalEvent =
            event?.type === "complete" ||
            event?.type === "error";
          const matchedTab =
            workTabs.find(
              (tab) =>
                tab.subscriptionId ===
                subscriptionId
            );

          if (
            matchedTab &&
            event?.type === "error"
          ) {
            showToast(
              "error",
              `Subscription disconnected: ${event?.error || nextText}`
            );
          }

          setWorkTabs((currentTabs) =>
            currentTabs.map((tab) =>
              tab.subscriptionId === subscriptionId
                ? {
                  ...tab,
                  response:
                    nextText,
                  responsePanelTab:
                    "body",
                  responseSize:
                    nextText.length,
                  subscriptionListening:
                    isTerminalEvent
                      ? false
                      : tab.subscriptionListening,
                  subscriptionId:
                    isTerminalEvent
                      ? undefined
                      : tab.subscriptionId,
                  responseStatus:
                    isTerminalEvent
                      ? event?.type === "error"
                        ? "Subscription error"
                        : "Disconnected"
                      : tab.responseStatus,
                }
                : tab
            )
          );

          const activeTab =
            workTabs.find(
              (tab) =>
                tab.id ===
                activeWorkTabId
            );

          if (
            activeTab?.subscriptionId ===
            subscriptionId
          ) {
            setEditorText(
              "result",
              nextText
            );
          }
        }
      );

    return () => {
      unsubscribe();
    };
  }, [activeWorkTabId, workTabs]);

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
    operationType: "query" | "mutation" | "subscription"
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

  function saveActiveWorkTabFromEditors() {
    if (!activeWorkTab) {
      return;
    }

    const currentId =
      activeWorkTabId;

    updateWorkTab(
      currentId,
      {
        operation:
          getEditorText("operation"),
        variables:
          getEditorText("variables"),
        headers:
          getEditorText("headers"),
        response:
          getEditorText("result"),
        cursorPosition:
          editorViewRef.current["operation"]?.state.selection.main.head,
      }
    );
  }

  function getActiveWorkTabSnapshot() {
    if (!activeWorkTab) {
      return createWorkspaceTab(1);
    }

    return {
      ...activeWorkTab,
      operation:
        getEditorText("operation") ||
        activeWorkTab.operation,
      variables:
        getEditorText("variables") ||
        activeWorkTab.variables,
      headers:
        getEditorText("headers") ||
        activeWorkTab.headers,
      response:
        getEditorText("result") ||
        activeWorkTab.response,
    };
  }

  function openSaveDialog() {
    const snapshot =
      getActiveWorkTabSnapshot();

    setSaveDialogDraft({
      name:
        snapshot.title.replace(
          /\s\*$/,
          ""
        ) || "Untitled API",
      collection:
        snapshot.collection ||
        "Default",
      folder:
        snapshot.folder ||
        "",
    });
    setSaveDialogOpen(true);
  }

  async function saveActiveTab(
    draft = saveDialogDraft
  ) {
    const snapshot =
      getActiveWorkTabSnapshot();

    const saved =
      await SaveSavedAPI({
        id:
          snapshot.savedApiId ||
          "",
        name:
          draft.name ||
          snapshot.title ||
          "Untitled API",
        collection:
          draft.collection ||
          "Default",
        folder:
          draft.folder ||
          "",
        endpoint:
          endpointDraft,
        query:
          snapshot.operation,
        variables:
          snapshot.variables,
        headers:
          snapshot.headers,
        updatedAt:
          0,
      } as any) as SavedAPIItem;

    updateWorkTab(
      activeWorkTabId,
      {
        savedApiId:
          saved.id,
        title:
          saved.name,
        collection:
          saved.collection,
        folder:
          saved.folder,
        operation:
          saved.query,
        variables:
          saved.variables,
        headers:
          saved.headers,
        isDirty:
          false,
      }
    );

    setActiveSavedAPI(saved);
    setSaveDialogOpen(false);
    await refreshSavedAPIs();
  }

  function handleSaveShortcut() {
    const snapshot =
      getActiveWorkTabSnapshot();

    if (snapshot.savedApiId) {
      saveActiveTab({
        name:
          snapshot.title,
        collection:
          snapshot.collection ||
          "Default",
        folder:
          snapshot.folder ||
          "",
      });
      return;
    }

    openSaveDialog();
  }

  useEffect(() => {
    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      const target =
        event.target as HTMLElement | null;
      const isEditableTarget =
        !!target &&
        (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          !!target.closest(".cm-editor")
        );

      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        handleSaveShortcut();
      }

      if (
        isEditableTarget ||
        sidebarMode !== "collections" ||
        !(event.ctrlKey || event.metaKey)
      ) {
        return;
      }

      const key =
        event.key.toLowerCase();

      if (
        (key === "c" || key === "x") &&
        selectedSavedAPIId
      ) {
        event.preventDefault();
        setSavedAPIClipboard({
          apiId:
            selectedSavedAPIId,
          mode:
            key === "x"
              ? "cut"
              : "copy",
        });
      }

      if (key === "v") {
        event.preventDefault();
        pasteSavedAPIClipboard();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    activeWorkTab,
    endpointDraft,
    saveDialogDraft,
    sidebarMode,
    selectedSavedAPIId,
    savedAPIClipboard,
    selectedCollectionTarget,
    savedAPIs,
  ]);

  function selectWorkTab(
    tabId: string
  ) {
    if (
      tabId ===
      activeWorkTabId
    ) {
      return;
    }

    saveActiveWorkTabFromEditors();
    setActiveWorkTabId(tabId);
    setResponseCopied(false);

    const nextTab =
      workTabs.find(
        (tab) =>
          tab.id === tabId
      );

    const savedApi =
      nextTab?.savedApiId
        ? savedAPIs.find(
          (api) =>
            api.id ===
            nextTab.savedApiId
        )
        : null;

    if (savedApi) {
      focusSavedAPIExplorer(
        savedApi
      );
    }
  }

  function addWorkTab() {
    saveActiveWorkTabFromEditors();

    const nextIndex =
      workTabs.length + 1;

    const nextTab =
      createWorkspaceTab(
        nextIndex
      );

    setWorkTabs((currentTabs) => [
      ...currentTabs,
      nextTab,
    ]);
    setActiveWorkTabId(
      nextTab.id
    );
    setResponseCopied(false);
  }

  function closeWorkTab(
    tabId: string,
    force = false
  ) {
    const closingTab =
      workTabs.find(
        (tab) =>
          tab.id === tabId
      );

    if (
      closingTab?.isDirty &&
      !force
    ) {
      setCloseConfirmTabId(
        tabId
      );
      return;
    }

    if (
      tabId ===
      activeWorkTabId
    ) {
      saveActiveWorkTabFromEditors();
    }

    const tabIndex =
      workTabs.findIndex(
        (tab) =>
          tab.id === tabId
      );

    const nextTabs =
      workTabs.filter(
        (tab) =>
          tab.id !== tabId
      );

    const nextActiveTab =
      tabId === activeWorkTabId
        ? nextTabs[
          Math.max(
            0,
            tabIndex - 1
          )
        ] ?? null
        : activeWorkTab;

    setWorkTabs(nextTabs);
    setActiveWorkTabId(
      nextActiveTab?.id ?? ""
    );

    const savedApi =
      nextActiveTab?.savedApiId
        ? savedAPIs.find(
          (api) =>
            api.id ===
            nextActiveTab.savedApiId
        )
        : null;

    if (savedApi) {
      focusSavedAPIExplorer(
        savedApi
      );
    } else if (!nextActiveTab) {
      backToDocumentation();
    } else if (
      activeSavedAPI?.id ===
      closingTab?.savedApiId
    ) {
      backToDocumentation();
    }

    setResponseCopied(false);
    setCloseConfirmTabId(null);
  }

  function closeAllWorkTabs(
    force = false
  ) {
    if (
      !force &&
      workTabs.some((tab) => tab.isDirty)
    ) {
      const dirtyTab =
        workTabs.find((tab) => tab.isDirty);

      setCloseConfirmTabId(
        dirtyTab?.id ?? null
      );
      return;
    }

    setWorkTabs([]);
    setActiveWorkTabId("");
    setResponseCopied(false);
    setTabContextMenu(null);
    backToDocumentation();
  }

  function togglePinWorkTab(
    tabId: string
  ) {
    setWorkTabs((currentTabs) =>
      currentTabs.map((tab) =>
        tab.id === tabId
          ? {
            ...tab,
            pinned:
              !tab.pinned,
          }
          : tab
      )
    );
    setTabContextMenu(null);
  }

  function setActiveRequestConfigTab(
    tab:
      RequestConfigTab
  ) {
    if (!activeWorkTab) {
      return;
    }

    updateWorkTab(
      activeWorkTab.id,
      {
        requestConfigTab:
          tab,
      }
    );
  }

  function getFirstRootFieldName(
    query: string
  ) {
    try {
      const ast =
        parse(
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

        const rootField =
          def.selectionSet.selections.find(
            (selection): selection is FieldNode =>
              selection.kind ===
              Kind.FIELD
          );

        return rootField?.name.value ?? null;
      }
    } catch {
      return null;
    }

    return null;
  }

  function focusSavedAPIExplorer(
    api: SavedAPIItem
  ) {
    setActiveSavedAPI(api);
    setSidebarMode("saved-api");
    dispatch(
      setEndpoint(api.endpoint)
    );

    const schema =
      schemaRef.current;

    if (!schema) {
      return;
    }

    const rootFieldName =
      getFirstRootFieldName(
        api.query
      );

    if (!rootFieldName) {
      return;
    }

    const operationType =
      getRootOperationType(
        schema,
        rootFieldName
      );

    const rootTypeName =
      operationType === "subscription"
        ? "Subscription"
        : operationType === "mutation"
        ? "Mutation"
        : "Query";

    const rootField =
      explorerSchema[
        rootTypeName
      ]?.fields.find(
        (field) =>
          field.name ===
          rootFieldName
      );

    if (!rootField) {
      return;
    }

    setSelectedField(rootField);
    setCurrentType(
      rootField.nextTypeName ||
      rootTypeName
    );
    setStack([
      {
        typeName: null,
        fieldName: "Root",
      },
      {
        typeName:
          rootTypeName,
        fieldName:
          rootTypeName,
      },
      {
        typeName:
          rootField.nextTypeName ||
          rootTypeName,
        fieldName:
          rootField.name,
      },
    ]);
    setSearchKeyword("");
  }

  function openSavedAPI(
    api: SavedAPIItem
  ) {
    saveActiveWorkTabFromEditors();

    const existingTab =
      workTabs.find(
        (tab) =>
          tab.savedApiId ===
          api.id
      );

    if (existingTab) {
      setActiveWorkTabId(
        existingTab.id
      );
      focusSavedAPIExplorer(api);
      return;
    }

    const nextTab: WorkspaceTab = {
      id:
        `workspace-${Date.now()}-${api.id}`,
      title:
        api.name,
      savedApiId:
        api.id,
      collection:
        api.collection,
      folder:
        api.folder,
      operation:
        api.query,
      variables:
        api.variables || "{}",
      headers:
        api.headers || "{}",
      response:
        "",
      requestConfigTab:
        "variables",
      responsePanelTab:
        "body",
      responseHeaders:
        {},
      responseCookies:
        [],
      isDirty:
        false,
    };

    setWorkTabs((currentTabs) => [
      ...currentTabs,
      nextTab,
    ]);

    setActiveWorkTabId(
      nextTab.id
    );
    focusSavedAPIExplorer(api);
  }

  function backToDocumentation() {
    setSidebarMode("collections");
    setActiveSavedAPI(null);
    refreshSavedAPIs();
  }

  function getFilteredSavedAPIs() {
    const keyword =
      collectionSearchKeyword.trim().toLowerCase();

    if (!keyword) {
      return savedAPIs;
    }

    return savedAPIs.filter((api) =>
      [
        api.name,
        api.folder,
        api.collection,
        api.endpoint,
      ]
        .filter(Boolean)
        .some((value) =>
          value.toLowerCase().includes(keyword)
        )
    );
  }

  function getCollectionGroups() {
    const groups:
      Record<
        string,
        Record<string, SavedAPIItem[]>
      > = {};

    getFilteredSavedAPIs().forEach((api) => {
      const collection =
        api.collection || "Default";
      const folder =
        api.folder || "Root";

      groups[collection] ??= {};
      groups[collection][folder] ??= [];
      groups[collection][folder].push(api);
    });

    return groups;
  }

  function savedAPIMatchesSearch(
    api: SavedAPIItem
  ) {
    const keyword =
      collectionSearchKeyword.trim().toLowerCase();

    if (!keyword) {
      return true;
    }

    return [
      api.name,
      api.folder,
      api.collection,
      api.endpoint,
    ]
      .filter(Boolean)
      .some((value) =>
        value.toLowerCase().includes(keyword)
      );
  }

  function collectionOrFolderMatchesSearch(
    value: string
  ) {
    const keyword =
      collectionSearchKeyword.trim().toLowerCase();

    return (
      !keyword ||
      value.toLowerCase().includes(keyword)
    );
  }

  function getAPIsForFolder(
    collection: string,
    folderPath: string
  ) {
    const normalizedPath =
      folderPath.replace(/^\/+|\/+$/g, "");

    return savedAPIs.filter((api) =>
      (api.collection || "Default") === collection &&
      (api.folder || "") === normalizedPath &&
      savedAPIMatchesSearch(api)
    );
  }

  function getDescendantFolderPaths(
    folder: SavedFolderItem,
    folderPath: string
  ): string[] {
    return [
      folderPath,
      ...(folder.folders ?? []).flatMap((child) =>
        getDescendantFolderPaths(
          child,
          `${folderPath}/${child.name}`
        )
      ),
    ];
  }

  function getFolderAPICount(
    collection: string,
    folder: SavedFolderItem,
    folderPath: string
  ) {
    const paths =
      new Set(
        getDescendantFolderPaths(
          folder,
          folderPath
        )
      );

    return savedAPIs.filter(
      (api) =>
        (api.collection || "Default") === collection &&
        paths.has(api.folder || "")
    ).length;
  }

  function getCollectionAPICount(
    collection: string
  ) {
    return savedAPIs.filter(
      (api) =>
        (api.collection || "Default") === collection
    ).length;
  }

  function toggleStringItem(
    items: string[],
    item: string
  ) {
    return items.includes(item)
      ? items.filter((value) => value !== item)
      : [
        ...items,
        item,
      ];
  }

  function toggleExpandedCollection(
    collection: string
  ) {
    setExpandedCollections((items) =>
      toggleStringItem(
        items,
        collection
      )
    );
  }

  function toggleExpandedFolder(
    key: string
  ) {
    setExpandedFolders((items) =>
      toggleStringItem(
        items,
        key
      )
    );
  }

  function toggleSavePickerCollection(
    collection: string
  ) {
    setSavePickerExpandedCollections((items) =>
      toggleStringItem(
        items,
        collection
      )
    );
  }

  function toggleSavePickerFolder(
    key: string
  ) {
    setSavePickerExpandedFolders((items) =>
      toggleStringItem(
        items,
        key
      )
    );
  }

  function folderHasVisibleContent(
    collection: string,
    folder: SavedFolderItem,
    folderPath: string
  ): boolean {
    return (
      collectionOrFolderMatchesSearch(folder.name) ||
      getAPIsForFolder(collection, folderPath).length > 0 ||
      (folder.folders ?? []).some((child) =>
        folderHasVisibleContent(
          collection,
          child,
          `${folderPath}/${child.name}`
        )
      )
    );
  }

  function getFolderPathOptions(
    folders: SavedFolderItem[],
    parentPath = ""
  ): string[] {
    return folders.flatMap((folder) => {
      const path =
        parentPath
          ? `${parentPath}/${folder.name}`
          : folder.name;

      return [
        path,
        ...getFolderPathOptions(
          folder.folders ?? [],
          path
        ),
      ];
    });
  }

  async function createCollection(
    name: string
  ) {
    const value =
      name.trim();

    if (!value) {
      return;
    }

    if (
      savedCollections.some(
        (collection) =>
          collection.name.toLowerCase() ===
          value.toLowerCase()
      )
    ) {
      showToast("error", "Collection already exists.");
      return;
    }

    try {
      await SaveCollection(value);
    } catch (error: any) {
      showToast(
        "error",
        error?.message?.includes("collection name already exists")
          ? "Collection already exists."
          : "Failed to create collection."
      );
      return;
    }
    setSaveDialogDraft((draft) => ({
      ...draft,
      collection:
        value,
    }));
    setCollectionDialog({
      open: false,
      mode: "create",
      oldName: "",
      name: "",
    });
    await refreshSavedAPIs();
  }

  async function createFolder(
    collection: string,
    parentPath: string,
    name: string
  ) {
    const value =
      name.trim();

    if (!value) {
      return;
    }

    const normalizedParent =
      parentPath.trim().replace(/^\/+|\/+$/g, "");

    const nextPath =
      normalizedParent
        ? `${normalizedParent}/${value}`
        : value;

    if (
      getFolderPathOptions(
        savedCollections.find(
          (item) =>
            item.name === collection
        )?.folders ?? []
      ).some(
        (folder) =>
          folder.toLowerCase() ===
          nextPath.toLowerCase()
      )
    ) {
      showToast("error", "Folder already exists.");
      return;
    }

    try {
      await SaveFolder({
        collection:
          collection || "Default",
        parentPath:
          normalizedParent,
        name:
          value,
      } as any);
    } catch (error: any) {
      showToast(
        "error",
        error?.message?.includes("folder name already exists")
          ? "Folder already exists."
          : "Failed to create folder."
      );
      return;
    }

    setSaveDialogDraft((draft) => ({
      ...draft,
      folder:
        nextPath,
    }));
    setFolderDialog({
      open: false,
      mode: "create",
      collection: "Default",
      parentPath: "",
      folderPath: "",
      name: "",
    });
    await refreshSavedAPIs();
  }

  async function renameCollectionAction() {
    const oldName =
      collectionDialog.oldName;
    const newName =
      collectionDialog.name.trim();

    if (!oldName || !newName) {
      return;
    }

    await RenameCollection({
      oldName,
      newName,
    } as any);
    setCollectionDialog({
      open: false,
      mode: "create",
      oldName: "",
      name: "",
    });
    await refreshSavedAPIs();
  }

  async function renameFolderAction() {
    if (
      !folderDialog.collection ||
      !folderDialog.folderPath ||
      !folderDialog.name.trim()
    ) {
      return;
    }

    await RenameFolder({
      collection:
        folderDialog.collection,
      folderPath:
        folderDialog.folderPath,
      newName:
        folderDialog.name,
    } as any);
    setFolderDialog({
      open: false,
      mode: "create",
      collection: "Default",
      parentPath: "",
      folderPath: "",
      name: "",
    });
    await refreshSavedAPIs();
  }

  async function deleteContextTarget() {
    if (!contextMenu) {
      return;
    }

    if (
      contextMenu.type ===
      "collection"
    ) {
      await DeleteCollection(
        contextMenu.collection
      );
    }

    if (
      contextMenu.type ===
      "folder"
    ) {
      await DeleteFolder({
        collection:
          contextMenu.collection,
        folderPath:
          contextMenu.folderPath,
      } as any);
    }

    if (
      contextMenu.type ===
      "api"
    ) {
      await DeleteSavedAPI(
        contextMenu.api.id
      );
    }

    setContextMenu(null);
    await refreshSavedAPIs();
  }

  async function pasteSavedAPIClipboard() {
    if (!savedAPIClipboard) {
      return;
    }

    const api =
      savedAPIs.find(
        (item) =>
          item.id ===
          savedAPIClipboard.apiId
      );

    if (!api) {
      setSavedAPIClipboard(null);
      return;
    }

    const targetCollection =
      selectedCollectionTarget.collection ||
      api.collection ||
      "Default";

    const targetFolder =
      selectedCollectionTarget.folder ||
      "";

    if (
      savedAPIClipboard.mode === "copy"
    ) {
      await SaveSavedAPI({
        ...api,
        id: "",
        name:
          `${api.name} Copy`,
        collection:
          targetCollection,
        folder:
          targetFolder,
        updatedAt:
          0,
      } as any);
    } else {
      await SaveSavedAPI({
        ...api,
        collection:
          targetCollection,
        folder:
          targetFolder,
        updatedAt:
          0,
      } as any);
      setSavedAPIClipboard(null);
    }

    await refreshSavedAPIs();
  }

  async function exportCollection(
    collectionName: string
  ) {
    const collection =
      savedCollections.find(
        (item) =>
          item.name === collectionName
      );

    if (!collection) {
      showToast("error", "Collection not found.");
      return;
    }

    const payload: CollectionExportPayload = {
      type:
        "graph-space-collection",
      version:
        1,
      collection,
      apis:
        savedAPIs.filter(
          (api) =>
            (api.collection || "Default") === collectionName
        ),
    };

    try {
      await SaveJSONFile(
        `${collectionName}.graphspace-collection.json`,
        JSON.stringify(payload, null, 2)
      );
      showToast("success", "Collection exported successfully.");
    } catch {
      showToast("error", "Failed to export collection.");
    }
  }

  async function importCollection() {
    try {
      const result =
        await OpenJSONFile();

      if (
        !result?.path
      ) {
        return;
      }

      const payload =
        JSON.parse(result.content) as CollectionExportPayload;

      if (
        payload.type !==
          "graph-space-collection" ||
        !payload.collection?.name
      ) {
        throw new Error("Invalid collection file.");
      }

      if (
        savedCollections.some(
          (collection) =>
            collection.name.toLowerCase() ===
            payload.collection.name.toLowerCase()
        )
      ) {
        throw new Error("Collection already exists.");
      }

      await SaveCollection(
        payload.collection.name
      );

      const createFolders = async (
        folders: SavedFolderItem[],
        parentPath = ""
      ) => {
        for (const folder of folders) {
          await SaveFolder({
            collection:
              payload.collection.name,
            parentPath,
            name:
              folder.name,
          } as any);

          await createFolders(
            folder.folders ?? [],
            parentPath
              ? `${parentPath}/${folder.name}`
              : folder.name
          );
        }
      };

      await createFolders(
        payload.collection.folders ?? []
      );

      for (const api of payload.apis ?? []) {
        await SaveSavedAPI({
          ...api,
          id: "",
          collection:
            payload.collection.name,
          updatedAt:
            0,
        } as any);
      }

      await refreshSavedAPIs();
      showToast("success", "Collection imported successfully.");
    } catch (error: any) {
      const message =
        error?.message === "Collection already exists."
          ? "Collection already exists."
          : "Failed to import collection.";

      showToast("error", message);
    }
  }

  async function createEnvironment() {
    const nextEnvironment: EnvironmentItem = {
      id:
        `environment-${Date.now()}`,
      name:
        "New Environment",
      variables:
        [],
    };

    setEnvironmentEditorDraft(
      nextEnvironment
    );
    setEnvironmentEditorOpen(true);
    setEnvironmentMenuOpen(false);
  }

  function updateEnvironmentEditorDraft(
    environment: EnvironmentItem
  ) {
    setEnvironmentEditorDraft(
      environment
    );
  }

  function openEnvironmentEditor(
    environment: EnvironmentItem
  ) {
    setEnvironmentEditorDraft({
      ...environment,
      variables:
        environment.variables.map((variable) => ({
          ...variable,
        })),
    });
    setEnvironmentEditorOpen(true);
    setEnvironmentMenuOpen(false);
  }

  function closeEnvironmentEditor() {
    setEnvironmentEditorOpen(false);
    setEnvironmentEditorDraft(null);
  }

  async function saveEnvironmentEditorDraft() {
    if (!environmentEditorDraft) {
      return;
    }

    const trimmedName =
      environmentEditorDraft.name.trim();

    if (!trimmedName) {
      showToast(
        "error",
        "Environment name is required."
      );
      return;
    }

    const nextEnvironment = {
      ...environmentEditorDraft,
      name:
        trimmedName,
    };

    const exists =
      environmentStore.environments.some(
        (environment) =>
          environment.id ===
          nextEnvironment.id
      );

    await persistEnvironmentStore({
      ...environmentStore,
      activeEnvironmentId:
        nextEnvironment.id,
      environments:
        exists
          ? environmentStore.environments.map((item) =>
            item.id === nextEnvironment.id
              ? nextEnvironment
              : item
          )
          : [
            ...environmentStore.environments,
            nextEnvironment,
          ],
    });
    closeEnvironmentEditor();
  }

  async function exportEnvironmentStore() {
    try {
      await SaveJSONFile(
        "graph-space-environments.json",
        JSON.stringify(
          {
            type: "graph-space-environments",
            version: 1,
            ...environmentStore,
          },
          null,
          2
        )
      );
      showToast("success", "Environments exported successfully.");
    } catch {
      showToast("error", "Failed to export environments.");
    }
  }

  async function importEnvironmentStore() {
    try {
      const result =
        await OpenJSONFile();

      if (
        !result?.path
      ) {
        return;
      }

      const payload =
        JSON.parse(result.content);

      const nextStore: EnvironmentStorePayload = {
        activeEnvironmentId:
          payload.activeEnvironmentId || "",
        environments:
          payload.environments || [],
      };

      if (!Array.isArray(nextStore.environments)) {
        throw new Error("Invalid environment file.");
      }

      await persistEnvironmentStore(
        nextStore
      );
      showToast("success", "Environments imported successfully.");
    } catch {
      showToast("error", "Failed to import environments.");
    }
  }

  async function saveGoogleDriveSettings() {
    try {
      const config =
        await SaveGoogleDriveConfig({
          clientId:
            googleConfig.clientId,
          clientSecret:
            googleConfig.clientSecret,
          accountEmail:
            googleConfig.accountEmail,
          redirectPort:
            53682,
          lockTTLSecond:
            60,
        } as any);

      setGoogleConfig({
        clientId:
          (config as GoogleDriveConfigView).clientId || "",
        clientSecret:
          "",
        clientSecretSet:
          (config as GoogleDriveConfigView).clientSecretSet || false,
        accountEmail:
          (config as GoogleDriveConfigView).accountEmail || googleConfig.accountEmail,
      });
      setCloudSettingsOpen(false);
      showToast("success", "Google Drive settings saved.");
      await refreshCloudState();
    } catch {
      showToast("error", "Failed to save Google Drive settings.");
    }
  }

  async function syncToGoogleDrive() {
    if (cloudActionLoading) {
      return;
    }

    setCloudActionLoading("push");
    try {
      const state =
        await SyncAllWorkspacesToGoogleDrive();
      setCloudSyncState(
        state as CloudSyncState
      );

      if ((state as CloudSyncState).status === "error") {
        showToast(
          "error",
          (state as CloudSyncState).message || "Failed to sync Google Drive."
        );
        return;
      }

      showToast("success", "Google Drive sync completed.");
    } catch {
      showToast("error", "Failed to sync Google Drive.");
    } finally {
      setCloudActionLoading(null);
    }
  }

  async function requestGoogleDriveAccess() {
    try {
      const state =
        await RequestGoogleDriveAccess();
      setCloudSyncState(
        state as CloudSyncState
      );
      showToast("success", "Google Drive connected.");
    } catch {
      showToast("error", "Failed to connect Google Drive.");
    }
  }

  async function pullFromGoogleDrive() {
    if (cloudActionLoading) {
      return;
    }

    setCloudActionLoading("pull");
    try {
      const state =
        await PullWorkspacesFromGoogleDrive();
      setCloudSyncState(
        state as CloudSyncState
      );

      if ((state as CloudSyncState).status === "error") {
        showToast(
          "error",
          (state as CloudSyncState).message || "Failed to pull from Google Drive."
        );
        return;
      }

      await refreshSavedAPIs();
      showToast("success", "Pulled collection data from Google Drive.");
    } catch {
      showToast("error", "Failed to pull from Google Drive.");
    } finally {
      setCloudActionLoading(null);
    }
  }

  function toggleBugReportTag(
    tagId: string
  ) {
    setBugReportDraft((draft) => ({
      ...draft,
      tags:
        draft.tags.includes(tagId)
          ? draft.tags.filter((item) => item !== tagId)
          : [
            ...draft.tags,
            tagId,
          ],
    }));
  }

  async function attachBugReportFile() {
    if (bugReportDraft.attachments.length >= 3) {
      showToast("error", "Bug report supports up to 3 attachments.");
      return;
    }

    try {
      const attachment =
        await OpenBugReportAttachmentFile();

      if (!attachment?.path) {
        return;
      }

      if (
        bugReportDraft.attachments.some(
          (item) =>
            item.path === attachment.path
        )
      ) {
        showToast("error", "This attachment is already added.");
        return;
      }

      setBugReportDraft((draft) => ({
        ...draft,
        attachments: [
          ...draft.attachments,
          attachment,
        ],
      }));
    } catch (error: any) {
      showToast(
        "error",
        error?.message || String(error) || "Failed to attach file."
      );
    }
  }

  function removeBugReportAttachment(
    path: string
  ) {
    setBugReportDraft((draft) => ({
      ...draft,
      attachments:
        draft.attachments.filter(
          (attachment) =>
            attachment.path !== path
        ),
    }));
  }

  async function submitBugReport() {
    const title =
      bugReportDraft.title.trim();
    const description =
      bugReportDraft.description.trim();
    const deviceOs =
      bugReportDraft.deviceOs.trim();

    if (!title) {
      showToast("error", "Bug report title is required.");
      return;
    }

    if (!description) {
      showToast("error", "Bug description is required.");
      return;
    }

    if (title.length > 100) {
      showToast("error", "Bug report title must be 100 characters or fewer.");
      return;
    }

    if (description.length > 2000) {
      showToast("error", "Bug description must be 2000 characters or fewer.");
      return;
    }

    if (!deviceOs) {
      showToast("error", "Device / OS is required.");
      return;
    }

    if (deviceOs.length > 100) {
      showToast("error", "Device / OS must be 100 characters or fewer.");
      return;
    }

    setBugReportSubmitting(true);
    try {
      await SubmitBugReport({
        title,
        description,
        deviceOs,
        tags:
          bugReportDraft.tags,
        attachments:
          bugReportDraft.attachments,
      } as any);
      setBugReportOpen(false);
      setBugReportDraft((draft) => ({
        ...draft,
        title:
          "",
        description:
          "",
        tags:
          [],
        attachments:
          [],
      }));
      showToast("success", "Bug report sent.");
    } catch (error: any) {
      showToast(
        "error",
        error?.message || String(error) || "Failed to send bug report."
      );
    } finally {
      setBugReportSubmitting(false);
    }
  }

  function renderCloudIcon() {
    if (cloudSyncState.status === "synced") {
      return <CloudCheck size={25} className="mr-1 text-green-1" />;
    }

    if (cloudSyncState.status === "pull_available") {
      return <CloudDownload size={25} className="mr-1 text-amber-400" />;
    }

    if (cloudSyncState.status === "pending") {
      return <CloudUpload size={25} className="mr-1 text-amber-400" />;
    }

    if (cloudSyncState.status === "error") {
      return <CloudOff size={25} className="mr-1 text-red-300" />;
    }

    return <CiCloudOnIcon strokeWidth={0.5} size={28} className='mr-1 text-white/30' />;
  }

  function renderHighlightedEnvironmentText(
    text: string
  ) {
    const parts:
      React.ReactNode[] = [];
    const regex =
      /\{\{[A-Za-z0-9_:-]+\}\}/g;
    let lastIndex = 0;
    let match:
      | RegExpExecArray
      | null;

    while (
      (match = regex.exec(text))
    ) {
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.slice(lastIndex, match.index)}
          </span>
        );
      }

      parts.push(
        <span key={`env-${match.index}`} className="rounded-[3px] bg-amber-500/15 text-amber-400">
          {match[0]}
        </span>
      );
      lastIndex =
        match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.slice(lastIndex)}
        </span>
      );
    }

    return parts;
  }

  useEffect(() => {
    const instance =
      tabScrollRef.current?.osInstance?.();

    const viewport =
      instance?.elements?.().viewport ??
      tabScrollRef.current;

    if (!viewport) {
      return;
    }

    const activeTabElement =
      viewport.querySelector?.(
        `[data-work-tab-id="${activeWorkTabId}"]`
      ) as HTMLElement | null;

    if (!activeTabElement) {
      return;
    }

    const left =
      activeTabElement.offsetLeft;

    const right =
      left +
      activeTabElement.offsetWidth;

    const visibleLeft =
      viewport.scrollLeft;

    const visibleRight =
      visibleLeft +
      viewport.clientWidth;

    if (right > visibleRight) {
      viewport.scrollTo({
        left:
          right -
          viewport.clientWidth,
        behavior: "smooth",
      });
      return;
    }

    if (left < visibleLeft) {
      viewport.scrollTo({
        left,
        behavior: "smooth",
      });
    }
  }, [activeWorkTabId]);

  function getCollectionItemId(
    collection: string
  ) {
    return `collection:${collection}`;
  }

  function getFolderItemId(
    collection: string,
    path: string
  ) {
    return `folder:${collection}:${path}`;
  }

  function getAPIItemId(
    apiId: string
  ) {
    return `api:${apiId}`;
  }

  function collectVisibleFolderItemIds(
    collection: string,
    folders: SavedFolderItem[],
    parentPath = ""
  ): string[] {
    return folders.flatMap((folder) => {
      const path =
        parentPath
          ? `${parentPath}/${folder.name}`
          : folder.name;

      if (!folderHasVisibleContent(collection, folder, path)) {
        return [];
      }

      const folderKey =
        `${collection}/${path}`;
      const items = [
        getFolderItemId(collection, path),
        ...getAPIsForFolder(collection, path).map((api) =>
          getAPIItemId(api.id)
        ),
      ];

      if (expandedFolders.includes(folderKey)) {
        items.push(
          ...collectVisibleFolderItemIds(
            collection,
            folder.folders ?? [],
            path
          )
        );
      }

      return items;
    });
  }

  function getVisibleTreeItemIds() {
    return savedCollections.flatMap((collection) => {
      const collectionId =
        getCollectionItemId(collection.name);
      const isExpanded =
        expandedCollections.includes(collection.name);

      if (!isExpanded) {
        return [collectionId];
      }

      return [
        collectionId,
        ...getAPIsForFolder(collection.name, "").map((api) =>
          getAPIItemId(api.id)
        ),
        ...collectVisibleFolderItemIds(
          collection.name,
          collection.folders ?? []
        ),
      ];
    });
  }

  function applyTreeSelection(
    itemId: string,
    event:
      | React.MouseEvent<HTMLElement>
      | React.KeyboardEvent<HTMLElement>
  ) {
    const isRange =
      event.shiftKey &&
      lastSelectedTreeItemId;
    const isToggle =
      event.ctrlKey ||
      event.metaKey;

    if (isRange) {
      const visibleIds =
        getVisibleTreeItemIds();
      const from =
        visibleIds.indexOf(lastSelectedTreeItemId);
      const to =
        visibleIds.indexOf(itemId);

      if (from !== -1 && to !== -1) {
        const [start, end] =
          from < to
            ? [from, to]
            : [to, from];
        const rangeIds =
          visibleIds.slice(start, end + 1);

        setSelectedTreeItemIds((current) =>
          Array.from(
            new Set([
              ...current,
              ...rangeIds,
            ])
          )
        );
        return;
      }
    }

    if (isToggle) {
      setSelectedTreeItemIds((current) =>
        current.includes(itemId)
          ? current.filter((id) => id !== itemId)
          : [
            ...current,
            itemId,
          ]
      );
      setLastSelectedTreeItemId(itemId);
      return;
    }

    setSelectedTreeItemIds([itemId]);
    setLastSelectedTreeItemId(itemId);
  }

  function renderSavedAPIButton(
    api: SavedAPIItem
  ) {
    const itemId =
      getAPIItemId(api.id);
    const isSelected =
      selectedTreeItemIds.includes(itemId);

    return (
      <div
        key={api.id}
        draggable={true}
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("application/x-graph-space-api", api.id);
          e.dataTransfer.setData("text/plain", JSON.stringify({ type: "api", id: api.id }));
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!selectedTreeItemIds.includes(itemId)) {
            applyTreeSelection(itemId, event);
          }
          setSelectedSavedAPIId(api.id);
          setContextMenu({
            type: "api",
            api: api,
            x: event.clientX,
            y: event.clientY,
          });
        }}
        onClick={(event) => {
          applyTreeSelection(itemId, event);
          setSelectedSavedAPIId(
            (event.ctrlKey || event.metaKey) && isSelected
              ? null
              : api.id
          );
        }}
        // className={`
        //   flex w-full items-center gap-1 rounded-[4px] py-1.5 pl-2 pr-2 text-left hover:bg-gray-2/50 cursor-grab active:cursor-grabbing select-none
        //   ${selectedSavedAPIId === api.id
        //     ? "bg-gray-2/50"
        //     : ""
        //   }
        // `}
        className={`
          group flex w-full items-center gap-1 rounded-[4px] py-1.5 pl-2 pr-2 text-left hover:bg-gray-2/50 cursor-grab active:cursor-grabbing select-none
          ${isSelected
            ? "bg-gray-2/50"
            : ""
          }
        `}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-white/45">
          <RxFileTextIcon size={14} />
        </span>
        <div className="flex flex-col min-w-0 flex-1">
          <span className="w-full truncate text-sm font-semibold text-white">
            {api.name}
          </span>
          <span className="w-full truncate text-xs text-white/45">
            {api.endpoint}
          </span>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            openSavedAPI(
              api
            );
          }}
          className="ml-auto inline-flex h-7 shrink-0 items-center rounded-[4px] px-2 text-xs font-semibold text-green-1 opacity-0 transition hover:bg-white/10 group-hover:opacity-100"
        >
          View
        </button>
      </div>
    );
  }

  function renderFolderTree(
    collection: string,
    folders: SavedFolderItem[],
    parentPath = "",
    depth = 0
  ): React.ReactNode {
    return folders.map((folder) => {
      const path =
        parentPath
          ? `${parentPath}/${folder.name}`
          : folder.name;

      if (
        !folderHasVisibleContent(
          collection,
          folder,
          path
        )
      ) {
        return null;
      }

      const apis =
        getAPIsForFolder(
          collection,
          path
        );
      const folderKey =
        `${collection}/${path}`;
      const itemId =
        getFolderItemId(collection, path);
      const isSelected =
        selectedTreeItemIds.includes(itemId);
      const expanded =
        expandedFolders.includes(
          folderKey
        );
      return (
        <div
          key={`${collection}-${path}`}
          className="relative"
        >
          <div
            draggable={true}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("application/x-graph-space-folder", JSON.stringify({ collection, path }));
              e.dataTransfer.setData("text/plain", JSON.stringify({ collection, path }));
            }}
            onDragEnd={() => {
              setDragOverTarget(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();

              const rect = e.currentTarget.getBoundingClientRect();
              const relativeY = e.clientY - rect.top;
              const height = rect.height;

              let position: "before" | "inside" | "after" = "inside";
              if (relativeY < height * 0.3) {
                position = "before";
              } else if (relativeY > height * 0.7) {
                position = "after";
              }

              setDragOverTarget({ collection, path, position });
            }}
            onDragLeave={() => {
              setDragOverTarget(null);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverTarget(null);

              const rawData = e.dataTransfer.getData("text/plain");
              if (!rawData) return;

              try {
                const dragged = JSON.parse(rawData);
                if (!dragged) return;

                if (dragged.type === "api") {
                  const apiItem = savedAPIs.find((a) => a.id === dragged.id);
                  if (apiItem) {
                    const updatedApi = {
                      ...apiItem,
                      collection: collection,
                      folder: path,
                    };
                    await SaveSavedAPI(updatedApi);
                    await refreshSavedAPIs();
                  }
                  return;
                }

                if (!dragged.collection || !dragged.path) return;

                if (
                  dragged.collection === collection &&
                  (path === dragged.path || path.startsWith(dragged.path + "/"))
                ) {
                  return;
                }

                const rect = e.currentTarget.getBoundingClientRect();
                const relativeY = e.clientY - rect.top;
                const height = rect.height;

                let position: "before" | "inside" | "after" = "inside";
                if (relativeY < height * 0.3) {
                  position = "before";
                } else if (relativeY > height * 0.7) {
                  position = "after";
                }

                await handleMoveFolder(dragged.collection, dragged.path, collection, path, position);
              } catch (err) {
                console.error("Failed to parse drag data:", err);
              }
            }}
            onClick={(event) => {
              applyTreeSelection(itemId, event);
              setSelectedSavedAPIId(null);
              setSelectedCollectionTarget({
                collection,
                folder:
                  path,
              });
              toggleExpandedFolder(
                folderKey
              );
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              if (!selectedTreeItemIds.includes(itemId)) {
                applyTreeSelection(itemId, event);
              }
              setSelectedSavedAPIId(null);
              setContextMenu({
                type: "folder",
                collection,
                folderPath:
                  path,
                name:
                  folder.name,
                x:
                  event.clientX,
                y:
                  event.clientY,
              });
            }}
            className={`
              flex items-center justify-between gap-2 rounded-[4px] px-2 py-2 text-base font-semibold tracking-wide text-white hover:bg-gray-2/50 cursor-pointer
              ${isSelected
                ? "bg-gray-2/50"
                : ""
              }
              ${dragOverTarget &&
                dragOverTarget.collection === collection &&
                dragOverTarget.path === path
                ? dragOverTarget.position === "inside"
                  ? "bg-gray-2/50 outline outline-1 outline-green-1"
                  : dragOverTarget.position === "before"
                    ? "border-t-2 border-t-green-1"
                    : "border-b-2 border-b-green-1"
                : ""
              }
            `}
          >
            <span className="flex min-w-0 items-center gap-1 truncate">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {expanded ? (
                  <ChevronDown
                    size={13}
                    className="text-white"
                  />
                ) : (
                  <ChevronRight
                    size={13}
                    className="text-white"
                  />
                )}
              </span>
              <span className="min-w-0 truncate">{folder.name}</span>
            </span>
          </div>
          {expanded && (
            <div className="ml-[16px] border-l border-white/10 pl-[8px]">
              {apis.map(renderSavedAPIButton)}
              {renderFolderTree(
                collection,
                folder.folders ?? [],
                path,
                depth + 1
              )}
            </div>
          )}
        </div>
      );
    });
  }

  function renderSaveFolderPicker(
    collection: string,
    folders: SavedFolderItem[],
    parentPath = "",
    depth = 0
  ): React.ReactNode {
    return folders.map((folder) => {
      const path =
        parentPath
          ? `${parentPath}/${folder.name}`
          : folder.name;
      const folderKey =
        `${collection}/${path}`;
      const expanded =
        savePickerExpandedFolders.includes(
          folderKey
        );
      const selected =
        saveDialogDraft.collection === collection &&
        saveDialogDraft.folder === path;

      return (
        <div
          key={`save-${folderKey}`}
          className="ml-[16px] border-l border-white/10 pl-2"
        >
          <button
            type="button"
            onClick={() => {
              setSaveDialogDraft((draft) => ({
                ...draft,
                collection,
                folder:
                  path,
              }));

              toggleSavePickerFolder(
                folderKey
              );
            }}
            className={`
              flex h-7 w-full items-center justify-between gap-2 rounded-[4px] px-2 text-left text-sm
              ${selected
                ? "bg-green-1/20 text-white"
                : "text-white hover:bg-white/10"
              }
            `}
          >
            <span className="flex min-w-0 items-center gap-1 truncate">
              {expanded ? (
                <ChevronDown
                  size={14}
                  className="text-white"
                />
              ) : (
                <ChevronRight
                  size={14}
                  className="text-white"
                />
              )}
              <span className="min-w-0 truncate">{folder.name}</span>
            </span>
          </button>
          {expanded &&
            renderSaveFolderPicker(
              collection,
              folder.folders ?? [],
              path,
              depth + 1
            )}
        </div>
      );
    });
  }

  function renderSaveLocationPicker() {
    return (
      <div className="max-h-[260px] overflow-y-auto rounded-[4px] border border-gray-1/70 bg-black-1 p-1">
        {savedCollections.length === 0 ? (
          <div className="px-2 py-5 text-center text-sm text-white/35">
            No collections
          </div>
        ) : (
          savedCollections.map((collection) => {
            const expanded =
              savePickerExpandedCollections.includes(
                collection.name
              );
            const selectedCollection =
              saveDialogDraft.collection === collection.name &&
              !saveDialogDraft.folder;
            return (
              <div key={`save-${collection.name}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSaveDialogDraft((draft) => ({
                      ...draft,
                      collection:
                        collection.name,
                      folder:
                        "",
                    }));
                    toggleSavePickerCollection(
                      collection.name
                    );
                  }}
                  className={`
                    flex h-7 w-full items-center justify-between gap-2 rounded-[4px] px-2 text-left text-sm font-semibold
                    ${selectedCollection
                      ? "bg-green-1/20 text-white"
                      : "text-white hover:bg-white/10"
                    }
                  `}
                >
                  <span className="flex min-w-0 items-center gap-1 truncate">
                    {expanded ? (
                      <ChevronDown
                        size={14}
                        className="text-white"
                      />
                    ) : (
                      <ChevronRight
                        size={14}
                        className="text-white"
                      />
                    )}
                    <span className="min-w-0 truncate">{collection.name}</span>
                  </span>
                </button>
                {expanded &&
                  renderSaveFolderPicker(
                    collection.name,
                    collection.folders ?? []
                  )}
              </div>
            );
          })
        )}
      </div>
    );
  }

  function renderWorkTab(
    tab: WorkspaceTab
  ) {
    const isActive =
      tab.id ===
      activeWorkTabId;

    return (
      <div
        key={tab.id}
        data-work-tab-id={tab.id}
        role="button"
        tabIndex={0}
        onClick={() =>
          selectWorkTab(
            tab.id
          )
        }
        onContextMenu={(event) => {
          event.preventDefault();
          setTabContextMenu({
            tabId:
              tab.id,
            x:
              event.clientX,
            y:
              event.clientY,
          });
        }}
        onKeyDown={(event) => {
          if (
            event.key ===
            "Enter" ||
            event.key ===
            " "
          ) {
            event.preventDefault();
            selectWorkTab(
              tab.id
            );
          }
        }}
        className={`
          relative group flex h-[43px] w-[150px] max-w-[150px] items-center gap-2
          cursor-default border-r border-r-gray-2 last:border-r-0 px-3 text-left text-sm transition-colors
          ${isActive
            ? "bg-black-1 text-white"
            : "bg-black-2 text-white/55 hover:bg-black-1/70 hover:text-white/85"
          }
        `}
      >
        {isActive && (
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-green-1" />
        )}
        <span className="min-w-0 flex-1 truncate">
          {tab.title}
        </span>
        {tab.pinned ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              togglePinWorkTab(
                tab.id
              );
            }}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-green-1 transition hover:bg-white/10"
            title="Unpin"
          >
            <Pin size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              closeWorkTab(
                tab.id
              );
            }}
            className="
              relative inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px]
              text-white/35 transition hover:bg-white/10 hover:text-white
            "
            aria-label={`Close ${tab.title}`}
          >
            {tab.isDirty && (
              <span className="absolute h-2 w-2 rounded-full bg-green-1 transition-opacity group-hover:opacity-0" />
            )}
            <X
              size={13}
              className={`
                transition-opacity
                ${tab.isDirty
                  ? "opacity-0 group-hover:opacity-100"
                  : isActive
                    ? "opacity-70 group-hover:opacity-100"
                    : "opacity-0 group-hover:opacity-100"
                }
              `}
            />
          </button>
        )}
      </div>
    );
  }


  return (
    <div className='w-full flex-1 flex min-h-0'>
      {/* left menu */}
      <div className='w-[48px] h-full bg-black-1 border-r border-r-gray-2 flex flex-col items-center'>
        <button
          type="button"
          onClick={() => {
            setSidebarMode("documentation");
            setActiveSavedAPI(null);
          }}
          className={`w-full h-[48px] flex justify-center items-center border-l-[3px] ${sidebarMode === "documentation" || sidebarMode === "saved-api"
            ? "border-l-green-1"
            : "border-l-transparent"
            }`}
        >
          <FileText size={28} className={`${sidebarMode === "documentation" ? 'text-white/80' : 'text-white/30'} mr-1 hover:text-white/80`} />
        </button>
        <button
          type="button"
          onClick={() => {
            setSidebarMode("collections");
            setActiveSavedAPI(null);
            refreshSavedAPIs();
          }}
          className={`w-full h-[48px] flex justify-center items-center border-l-[3px] ${sidebarMode === "collections"
            ? "border-l-green-1"
            : "border-l-transparent"
            }`}
        >
          <BiCollectionIcon size={28} className={`mr-1 ${sidebarMode === "collections"
            ? "text-white/80"
            : "text-white/30"
            } hover:text-white/80`} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (cloudSyncState.status === "pull_available") {
              pullFromGoogleDrive();
              return;
            }
            setCloudDialogOpen(true);
            setCloudSettingsOpen(
              !googleConfig.clientId ||
              !googleConfig.clientSecretSet
            );
            refreshCloudState();
            refreshGoogleConfig();
          }}
          className='w-full h-[48px] flex justify-center items-center'
          title={cloudSyncState.message || "Google Drive sync"}
        >
          {renderCloudIcon()}
        </button>
        <div className="relative mt-auto w-full" ref={settingsMenuRef}>
          <button
            type="button"
            onClick={() =>
              setSettingsMenuOpen((open) => !open)
            }
            className="flex h-[48px] w-full items-center justify-center text-white/35 hover:text-white/80"
            title="Settings"
          >
            <Settings size={24} />
          </button>
          {settingsMenuOpen && (
            <div className="fixed bottom-3 left-[58px] z-[120] w-[180px] rounded-[6px] border border-gray-1 bg-black-2 py-1 text-left shadow-2xl">
              <button
                type="button"
                onClick={() => {
                  setSettingsMenuOpen(false);
                  setBugReportOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white"
              >
                <Bug size={15} />
                Report bug
              </button>
            </div>
          )}
        </div>
      </div>
      {/* body */}
      <Group orientation="horizontal" className="h-full min-h-0">
        <Panel defaultSize={"350px"} minSize={"280px"} className='flex flex-col min-h-0'>
          <div className="flex-1 bg-black-1 flex flex-col min-h-0">
            <div className={`${sidebarMode === "collections" ? '' : 'p-2.5'}`}>
              {sidebarMode === "saved-api" &&
                activeSavedAPI && (
                  <div className="mb-2 flex min-w-0 items-center gap-2 text-left">
                    <button
                      type="button"
                      onClick={backToDocumentation}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] text-white/65 hover:bg-white/10 hover:text-white"
                    >
                      <ArrowRight
                        size={18}
                        className="rotate-180"
                      />
                    </button>
                    <span className="min-w-0 truncate text-sm font-semibold text-white/85">
                      {activeSavedAPI.name}
                    </span>
                  </div>
                )}
              {sidebarMode !== "collections" && (
                <div className='w-full rounded-sm outline outline-1 outline-gray-1/50 bg-gray-3 flex pl-2 gap-2'>
                  <div className={`w-2.5 h-2.5 min-w-2.5 min-h-2.5 rounded-full my-auto ${schemaStatus === "error"
                    ? "bg-red-500"
                    : "bg-green-1"
                    }`}></div>
                  <div className="relative min-w-0 flex-1">
                    <div className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre rounded-sm px-2 text-left font-inherit text-white">
                      {endpointDraft
                        ? renderHighlightedEnvironmentText(endpointDraft)
                        : <span className="text-white/30">Enter URL</span>}
                    </div>
                    <input
                      value={endpointDraft}
                      onChange={e => { setEndpointDraft(e.target.value) }}
                      spellCheck={false}
                      list="environment-variable-options"
                      className='relative h-[38px] w-full rounded-sm px-2 bg-transparent text-left text-transparent caret-white outline-none placeholder:text-transparent'
                      placeholder=''
                      aria-label="Endpoint URL"
                    />
                  </div>
                  <datalist id="environment-variable-options">
                    {environmentVariables.map((variable) => (
                      <option key={variable.id} value={`{{${variable.key}}}`} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>
            {sidebarMode === "documentation" && (
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
            )}
            {sidebarMode === "collections" && (
              <div className="px-2.5 pt-3">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-semibold leading-4">Collections</p>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={importCollection}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                      title="Import collection"
                    >
                      <Upload size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCollectionDialog({
                          open: true,
                          mode: "create",
                          oldName: "",
                          name: "",
                        })
                      }
                      className="inline-flex h-8 items-center gap-1 rounded-[4px] bg-white/10 px-2 text-base font-semibold text-white/70 hover:bg-white/15 hover:text-white"
                    >
                      <Plus size={14} />
                      Collection
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex h-9 items-center gap-2 mb-2 rounded-sm outline outline-1 outline-gray-1/50 bg-gray-3 px-2">
                  <Search size={16} className="text-white/35" />
                  <input
                    value={collectionSearchKeyword}
                    onChange={(event) =>
                      setCollectionSearchKeyword(
                        event.target.value
                      )
                    }
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/30"
                    placeholder="Search API, folder, collection"
                  />
                </div>
                <div>
                  <datalist id="collection-tab-options">
                    {existingCollections.map((collection) => (
                      <option
                        key={collection}
                        value={collection}
                      />
                    ))}
                  </datalist>
                  <datalist id="folder-tab-options">
                    {existingFolders.map((folder) => (
                      <option
                        key={folder}
                        value={folder}
                      />
                    ))}
                  </datalist>
                </div>
              </div>
            )}
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
                  <div className="flex items-center gap-3 border-b border-b-gray-2 px-3 py-1">
                    <Search size={22} className="text-white/45" />
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
                      className="rounded-[4px] px-2 py-1 text-base font-semibold text-white/45 hover:bg-white/10 hover:text-white"
                    >
                      Esc
                    </button>
                  </div>

                  <OverlayScrollbarsComponent
                    className="max-h-[520px] px-3 py-3"
                    options={overlayScrollOptions}
                    defer
                  >
                    {([
                      "Query",
                      "Mutation",
                      "Subscription",
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
                            className=""
                          >
                            <div className="text-left text-lg font-bold tracking-wide text-green-1">
                              {operationType} result
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
                                    className="flex w-full font-medium items-center justify-between gap-4 rounded-[4px] px-3 py-1 text-left text-lg text-white/80 hover:bg-gray-2/50 hover:text-white"
                                  >
                                    <span className="min-w-0 truncate">
                                      {field.name}
                                    </span>
                                    <span className="shrink-0 truncate text-base text-[#5B8DBD]">
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
            {sidebarMode !== "collections" && (
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
            )}
            <div className='relative flex-1 flex flex-col min-h-0 !overflow-y-clip bg-black-1'>
              {sidebarMode === "collections" && (
                <OverlayScrollbarsComponent
                  className='w-full min-h-0 flex-1 bg-black-1'
                  options={overlayScrollOptions}
                  defer
                >
                  <div className="px-2.5 pb-4 text-left">
                    {savedCollections.length === 0 ? (
                      <div className="py-8 text-center text-sm text-white/35">
                        No saved APIs
                      </div>
                    ) : (
                      savedCollections.map(
                        (collection) => {
                          const rootAPIs =
                            getAPIsForFolder(
                              collection.name,
                              ""
                            );
                          const visibleFolders =
                            (collection.folders ?? []).filter((folder) =>
                              folderHasVisibleContent(
                                collection.name,
                                folder,
                                folder.name
                              )
                            );
                          const visible =
                            collectionOrFolderMatchesSearch(collection.name) ||
                            rootAPIs.length > 0 ||
                            visibleFolders.length > 0;

                          if (!visible) {
                            return null;
                          }

                          const isExpanded =
                            expandedCollections.includes(
                              collection.name
                            );
                          const itemId =
                            getCollectionItemId(collection.name);
                          const isSelected =
                            selectedTreeItemIds.includes(itemId);
                          return (
                            <div
                              key={collection.name}
                              className="pt-0"
                            >
                              <div
                                onClick={(event) => {
                                  applyTreeSelection(itemId, event);
                                  setSelectedSavedAPIId(null);
                                  setSelectedCollectionTarget({
                                    collection:
                                      collection.name,
                                    folder:
                                      "",
                                  });
                                  toggleExpandedCollection(
                                    collection.name
                                  );
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  if (!selectedTreeItemIds.includes(itemId)) {
                                    applyTreeSelection(itemId, event);
                                  }
                                  setSelectedSavedAPIId(null);
                                  setContextMenu({
                                    type: "collection",
                                    collection:
                                      collection.name,
                                    x:
                                      event.clientX,
                                    y:
                                      event.clientY,
                                  });
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();

                                  if (e.dataTransfer.types.includes("application/x-graph-space-api")) {
                                    return;
                                  }

                                  setDragOverTarget({
                                    collection: collection.name,
                                    path: "",
                                    position: "inside",
                                  });
                                }}
                                onDragLeave={() => {
                                  setDragOverTarget(null);
                                }}
                                onDrop={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDragOverTarget(null);

                                  const rawData = e.dataTransfer.getData("text/plain");
                                  if (!rawData) return;

                                  try {
                                    const dragged = JSON.parse(rawData);
                                    if (!dragged) return;

                                    if (dragged.type === "api") {
                                      return; // Do not allow dropping API on collection roots!
                                    }

                                    if (!dragged.collection || !dragged.path) return;

                                    await handleMoveFolder(
                                      dragged.collection,
                                      dragged.path,
                                      collection.name,
                                      "",
                                      "inside"
                                    );
                                  } catch (err) {
                                    console.error("Failed to parse drag data:", err);
                                  }
                                }}
                                className={`
                                flex items-center justify-between gap-2 rounded-[4px] px-1 py-2 text-base font-semibold tracking-wide text-white hover:bg-gray-2/50 cursor-pointer
                                ${isSelected
                                    ? "bg-gray-2/50"
                                    : ""
                                  }
                                ${dragOverTarget &&
                                    dragOverTarget.collection === collection.name &&
                                    dragOverTarget.path === "" &&
                                    dragOverTarget.position === "inside"
                                    ? "bg-gray-2/50 outline outline-1 outline-green-1"
                                    : ""
                                  }
                              `}
                              >
                                <span className="flex min-w-0 items-center gap-1 truncate">
                                  <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                                    {isExpanded ? (
                                      <ChevronDown
                                        size={15}
                                        className="text-white"
                                      />
                                    ) : (
                                      <ChevronRight
                                        size={15}
                                        className="text-white"
                                      />
                                    )}
                                  </span>
                                  <span className="min-w-0 truncate">
                                    {collection.name}
                                  </span>
                                </span>
                              </div>
                              {isExpanded && (
                                <div className="ml-[16px] border-l border-white/10 pl-[8px]">
                                  {rootAPIs.map(
                                    renderSavedAPIButton
                                  )}
                                  {renderFolderTree(
                                    collection.name,
                                    visibleFolders
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        }
                      )
                    )}
                  </div>
                </OverlayScrollbarsComponent>
              )}
              {sidebarMode !== "collections" && (
                <>
                  {
                    !currentType &&
                    <div className='w-full min-h-0'>
                      {
                        ("Query" in explorerSchema) &&
                        <FieldGroup onClick={() => openRootType("Query")} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/50 group">
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
                        <FieldGroup onClick={() => openRootType("Mutation")} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/50 group">
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
                      {
                        ("Subscription" in explorerSchema) &&
                        <FieldGroup onClick={() => openRootType("Subscription")} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/50 group">
                          <Field orientation="horizontal">
                            <Checkbox
                              checked={rootOperations.subscription}
                              onCheckedChange={(checked) => {
                                setRootOperation("subscription", !!checked);

                                if (checked) {
                                  setCurrentType("Subscription");
                                }
                              }}
                              strokeWidth={5} id="subscriptions" name="subscriptions" className='data-[state=checked]:bg-green-1/70 w-5 h-5 transition-none! border-white/50 text-white/80 text-lg text-bold!' />
                            <FieldLabel className='w-full flex justify-between'>
                              <p className='-ml-2 text-lg font-medium text-nowrap overflow-hidden'>subscription: <span className='text-[#5B8DBD]'>Subscription</span></p>
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
                                <FieldGroup key={arg.name} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/50 group">
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
                            currentType === "Mutation" ||
                            currentType === "Subscription";
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
                            <FieldGroup key={field.name} onClick={() => openField(field)} className="w-full px-2.5 py-1 border-dashed border-t border-t-gray-1 hover:bg-gray-2/50 group">
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
                                  {expandable && <ArrowRight size={20} className='group-hover:block hidden shrink-0 mt-1' />}
                                </FieldLabel>
                              </Field>
                            </FieldGroup>
                          )
                        })
                      }
                    </OverlayScrollbarsComponent>
                  }

                </>
              )}
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
          <div className="bg-black-2 h-[43px] shrink-0 flex items-center justify-between overflow-hidden">
            <div className="flex-1 min-w-0 h-full flex items-end">
              {workTabs.filter((tab) => tab.pinned).map(renderWorkTab)}
              <OverlayScrollbarsComponent
                ref={tabScrollRef}
                className="min-w-0 max-w-fit h-full"
                options={tabScrollOptions}
                defer
              >
                <div className="flex h-full min-w-max items-end">
                  {workTabs.filter((tab) => !tab.pinned).map(renderWorkTab)}
                </div>
              </OverlayScrollbarsComponent>
              <button
                type="button"
                onClick={addWorkTab}
                className="
                 border-l border-l-gray-2 flex h-[43px] w-[43px] shrink-0 items-center justify-center
                  text-white/55 transition-colors
                "
                title="New tab"
              >
                <Plus size={17} />
              </button>
            </div>

            <div className="relative" ref={environmentMenuRef}>
              <button
                type="button"
                onClick={() =>
                  setEnvironmentMenuOpen((open) => !open)
                }
                className="flex items-center gap-1.5 px-3 h-[40px] text-white bg-black-1 border-l border-l-gray-2 transition-colors cursor-pointer select-none shrink-0"
              >
                <Settings size={16} />
                <span className="max-w-[170px] truncate text-sm font-medium">
                  {activeEnvironment?.name || "No environment"}
                </span>
                <ChevronDown size={14} className="opacity-70 mt-[1px]" />
              </button>
              {environmentMenuOpen && (
                <div className="fixed right-3 top-[94px] z-[120] w-[350px] rounded-[4px] border border-gray-1 bg-black-2 text-left shadow-2xl">
                  <div className="flex h-9 items-center border-b border-gray-2">
                    <input
                      autoFocus
                      value={environmentSearch}
                      onChange={(event) => setEnvironmentSearch(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-white/35"
                      placeholder="Search"
                    />
                    <button
                      type="button"
                      onClick={importEnvironmentStore}
                      className="flex h-full w-10 items-center justify-center border-l border-gray-2 text-white/55 hover:bg-white/10 hover:text-white"
                      title="Import environment"
                    >
                      <Upload size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={createEnvironment}
                      className="flex h-full w-10 items-center justify-center border-l border-gray-2 text-white/55 hover:bg-white/10 hover:text-white"
                      title="New environment"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto p-2">
                    <button
                      type="button"
                      onClick={() => {
                        persistEnvironmentStore({
                          ...environmentStore,
                          activeEnvironmentId: "",
                        });
                        setEnvironmentMenuOpen(false);
                      }}
                      className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-2 text-sm hover:bg-white/10 ${
                        !environmentStore.activeEnvironmentId ? "bg-white/10 text-white" : "text-white/60"
                      }`}
                    >
                      <span className="w-4">{!environmentStore.activeEnvironmentId ? <Check size={14} /> : null}</span>
                      No environment
                    </button>
                    {environmentStore.environments
                      .filter((environment) =>
                        environment.name.toLowerCase().includes(environmentSearch.trim().toLowerCase())
                      )
                      .map((environment) => (
                        <div key={environment.id} className="group flex items-center rounded-[4px] hover:bg-white/10">
                          <button
                            type="button"
                            onClick={() => {
                              persistEnvironmentStore({
                                ...environmentStore,
                                activeEnvironmentId: environment.id,
                              });
                              setEnvironmentMenuOpen(false);
                            }}
                            className={`flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm ${
                              environmentStore.activeEnvironmentId === environment.id ? "text-white" : "text-white/70"
                            }`}
                          >
                            <span className="w-4">{environmentStore.activeEnvironmentId === environment.id ? <Check size={14} /> : null}</span>
                            <span className="truncate">{environment.name}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              openEnvironmentEditor(environment);
                            }}
                            className="mr-1 hidden h-7 w-7 items-center justify-center rounded-[4px] text-white/45 hover:bg-white/10 hover:text-white group-hover:flex"
                            title="Edit"
                          >
                            <Edit3 size={14} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          {activeWorkTab && (
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
                          (!canRunOperation &&
                            !activeWorkTab.subscriptionListening) ||
                          isRunningOperation
                        }
                        onClick={runActiveOperation}
                        onMouseEnter={() => setIsRunButtonHovered(true)}
                        onMouseLeave={() => setIsRunButtonHovered(false)}
                        className={`
                          inline-flex h-8 pl-2 pr-3 w-fit items-center justify-left gap-2 rounded-[4px]
                          text-base font-bold leading-none transition-colors
                          ${(canRunOperation || activeWorkTab.subscriptionListening) && !isRunningOperation
                            ? activeWorkTab.subscriptionListening && isRunButtonHovered
                              ? "bg-red-500/80 text-white hover:bg-red-500 cursor-pointer"
                              : activeWorkTab.subscriptionListening
                                ? "bg-orange-400/35 text-orange-50 hover:bg-orange-400/45 cursor-pointer"
                                : "bg-green-1/70 text-white hover:bg-green-1 cursor-pointer"
                            : "bg-green-1/25 text-white/45 cursor-default"
                          }
                        `}
                      >
                        {!isRunningOperation && activeWorkTab.subscriptionListening ? (
                          <span className="relative flex h-3.5 w-3.5 shrink-0 items-center justify-center">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                          </span>
                        ) : !isRunningOperation ? (
                          <BiCaretRightIcon size={18} className="shrink-0" />
                        ) : null}
                        {isRunningOperation ? <div className="mx-auto">
                          <div className="w-5 h-5 border-2 border-white border-t-black-1 rounded-full animate-spin" />
                        </div> : activeWorkTab.subscriptionListening
                          ? isRunButtonHovered
                            ? "Disconnect"
                            : "Listening..."
                          : "Run"}
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
                    <div className="flex h-[40px] pt-0.5 shrink-0 items-center border-b border-b-gray-2">
                      <button
                        type="button"
                        onClick={() => setActiveRequestConfigTab("variables")}
                        className={`
                          h-full px-3 text-base font-semibold tracking-wide
                          border-b-2 transition-colors
                          ${activeWorkTab.requestConfigTab === "variables"
                            ? "border-green-1 text-white"
                            : "border-transparent text-white/45 hover:text-white/75"
                          }
                        `}
                      >
                        Variables
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveRequestConfigTab("headers")}
                        className={`
                          h-full px-3 text-base font-semibold tracking-wide
                          border-b-2 transition-colors
                          ${activeWorkTab.requestConfigTab === "headers"
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
                          ${activeWorkTab.requestConfigTab === "variables"
                            ? "opacity-100 pointer-events-auto"
                            : "opacity-0 pointer-events-none"
                          }
                        `}
                        ref={variablesDomRef}
                      />
                      <div
                        className={`
                          absolute inset-0 min-h-0
                          ${activeWorkTab.requestConfigTab === "headers"
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
                <div className="flex min-h-[40px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-b-gray-2 px-3 py-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    {(["body", "cookies", "headers"] as ResponsePanelTab[]).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveResponsePanelTab(tab)}
                        className={`
                          h-8 px-2 text-base font-semibold capitalize transition-colors border-b-2
                          ${activeWorkTab.responsePanelTab === tab
                            ? "border-green-1 text-white"
                            : "border-transparent text-white/45 hover:text-white/75"
                          }
                        `}
                      >
                        {tab}
                        {tab === "cookies" && activeWorkTab.responseCookies.length > 0
                          ? ` (${activeWorkTab.responseCookies.length})`
                          : ""}
                        {tab === "headers" && Object.keys(activeWorkTab.responseHeaders).length > 0
                          ? ` (${Object.keys(activeWorkTab.responseHeaders).length})`
                          : ""}
                      </button>
                    ))}
                  </div>
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-white/55">
                    {activeWorkTab.responseStatus && (
                      <span className={`rounded-[3px] px-1.5 py-0.5 font-semibold ${
                        (activeWorkTab.responseStatusCode ?? 0) >= 400
                          ? "bg-red-500/25 text-red-200"
                          : "bg-green-1/20 text-green-1"
                      }`}>
                        {formatResponseStatus(
                          activeWorkTab.responseStatusCode,
                          activeWorkTab.responseStatus
                        )}
                      </span>
                    )}
                    {activeWorkTab.responseDuration !== undefined && (
                      <span className="inline-flex items-center gap-1">
                        <Clock size={13} />
                        {formatResponseDuration(activeWorkTab.responseDuration)}
                      </span>
                    )}
                    {activeWorkTab.responseSize !== undefined && (
                      <span className="inline-flex items-center gap-1">
                        <Database size={13} />
                        {formatResponseSize(activeWorkTab.responseSize)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={copyResponseToClipboard}
                      className="
                        inline-flex h-7 w-7 items-center justify-center rounded-[4px]
                        text-white transition-colors hover:bg-white/10 hover:text-white
                      "
                      title="Copy response"
                    >
                      {responseCopied ? (
                        <Check size={20} />
                      ) : (
                        <Copy size={20} />
                      )}
                    </button>
                  </div>
                </div>
                <div className="relative flex-1 min-h-0 text-left">
                  <div
                    className={`absolute inset-0 ${activeWorkTab.responsePanelTab === "body" ? "opacity-100" : "pointer-events-none opacity-0"}`}
                    ref={resultDomRef}
                  />
                  {activeWorkTab.responsePanelTab === "cookies" && (
                    <OverlayScrollbarsComponent className="absolute inset-0" options={overlayScrollOptions} defer>
                      <table
                        className="border-collapse text-left text-sm"
                        style={{
                          width:
                            "100%",
                          minWidth:
                            cookieColumnWidths.reduce((total, width) => total + width, 0),
                        }}
                      >
                        <colgroup>
                          {cookieColumnWidths.map((width, index) => (
                            <col key={index} style={{ width }} />
                          ))}
                        </colgroup>
                        <thead className="text-white/60">
                          <tr>
                            {["Name", "Value", "Domain", "Path", "Expires", "HttpOnly", "Secure"].map((header, index) => (
                              <th key={header} className="relative border-r border-b border-gray-2 px-3 py-2 font-semibold last:border-r">
                                {header}
                                <div
                                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-green-1/70"
                                  onMouseDown={(event) =>
                                    startColumnResize(
                                      cookieColumnWidths,
                                      setCookieColumnWidths,
                                      index,
                                      event
                                    )
                                  }
                                />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeWorkTab.responseCookies.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-3 py-4 text-white/35">
                                No cookies
                              </td>
                            </tr>
                          ) : activeWorkTab.responseCookies.map((cookie) => (
                            <tr key={`${cookie.name}-${cookie.domain}-${cookie.path}`} className="text-white/80">
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{cookie.name}</td>
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{cookie.value}</td>
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{cookie.domain}</td>
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{cookie.path}</td>
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{cookie.expires}</td>
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{String(cookie.httpOnly)}</td>
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{String(cookie.secure)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </OverlayScrollbarsComponent>
                  )}
                  {activeWorkTab.responsePanelTab === "headers" && (
                    <OverlayScrollbarsComponent className="absolute inset-0" options={overlayScrollOptions} defer>
                      <table
                        className="border-collapse text-left text-sm"
                        style={{
                          width:
                            "100%",
                          minWidth:
                            headerColumnWidths.reduce((total, width) => total + width, 0),
                        }}
                      >
                        <colgroup>
                          {headerColumnWidths.map((width, index) => (
                            <col key={index} style={{ width }} />
                          ))}
                        </colgroup>
                        <thead className="text-white/60">
                          <tr>
                            {["Name", "Value"].map((header, index) => (
                              <th key={header} className="relative border-r border-b border-gray-2 px-3 py-2 font-semibold">
                                {header}
                                <div
                                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-green-1/70"
                                  onMouseDown={(event) =>
                                    startColumnResize(
                                      headerColumnWidths,
                                      setHeaderColumnWidths,
                                      index,
                                      event
                                    )
                                  }
                                />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {Object.keys(activeWorkTab.responseHeaders).length === 0 ? (
                            <tr>
                              <td colSpan={2} className="px-3 py-4 text-white/35">
                                No headers
                              </td>
                            </tr>
                          ) : Object.entries(activeWorkTab.responseHeaders).map(([name, value]) => (
                            <tr key={name} className="text-white/80">
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{name}</td>
                              <td className="border-r border-b border-gray-2 px-3 py-2 whitespace-nowrap">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </OverlayScrollbarsComponent>
                  )}
                </div>
              </div>
            </Panel>
          </Group>
          )}
        </Panel>
      </Group>
      {closeConfirmTabId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5">
          <div className="w-[420px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="text-base font-semibold text-white">
              Tab chưa lưu
            </div>
            <div className="mt-2 text-sm leading-6 text-white/60">
              Tab này có thay đổi chưa được lưu. Bạn có chắc muốn đóng tab này không? Bấm Ctrl + S để lưu.
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setCloseConfirmTabId(null)
                }
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetId =
                    closeConfirmTabId;
                  setCloseConfirmTabId(null);
                  closeWorkTab(
                    targetId,
                    true
                  );
                }}
                className="rounded-[4px] bg-red-500/80 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {tabContextMenu && (
        <div
          className="fixed z-[70] min-w-[150px] rounded-[6px] border border-gray-1 bg-black-2 py-1 text-left shadow-2xl"
          style={{
            left:
              tabContextMenu.x,
            top:
              tabContextMenu.y,
          }}
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <button
            type="button"
            onClick={() => {
              closeWorkTab(
                tabContextMenu.tabId
              );
              setTabContextMenu(null);
            }}
            className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => closeAllWorkTabs(true)}
            className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
          >
            Close all
          </button>
          <button
            type="button"
            onClick={() =>
              togglePinWorkTab(
                tabContextMenu.tabId
              )
            }
            className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
          >
            {workTabs.find((tab) => tab.id === tabContextMenu.tabId)?.pinned
              ? "Unpin"
              : "Pin"}
          </button>
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed z-[60] min-w-[180px] rounded-[6px] border border-gray-1 bg-black-2 py-1 text-left shadow-2xl"
          style={{
            left:
              contextMenu.x,
            top:
              contextMenu.y,
          }}
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          {contextMenu.type !== "api" && (
            <button
              type="button"
              onClick={() => {
                setFolderDialog({
                  open: true,
                  mode: "create",
                  collection:
                    contextMenu.collection,
                  parentPath:
                    contextMenu.type === "folder"
                      ? contextMenu.folderPath
                      : "",
                  folderPath: "",
                  name: "",
                });
                setContextMenu(null);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              Create folder
            </button>
          )}
          {contextMenu.type === "collection" && (
            <button
              type="button"
              onClick={() => {
                exportCollection(
                  contextMenu.collection
                );
                setContextMenu(null);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              Export
            </button>
          )}
          {contextMenu.type === "collection" && (
            <button
              type="button"
              onClick={() => {
                setCollectionDialog({
                  open: true,
                  mode: "rename",
                  oldName:
                    contextMenu.collection,
                  name:
                    contextMenu.collection,
                });
                setContextMenu(null);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              Rename
            </button>
          )}
          {contextMenu.type === "folder" && (
            <button
              type="button"
              onClick={() => {
                setFolderDialog({
                  open: true,
                  mode: "rename",
                  collection:
                    contextMenu.collection,
                  parentPath: "",
                  folderPath:
                    contextMenu.folderPath,
                  name:
                    contextMenu.name,
                });
                setContextMenu(null);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              Rename
            </button>
          )}
          {contextMenu.type === "api" && (
            <button
              type="button"
              onClick={() => {
                setApiDialog({
                  open: true,
                  apiId: contextMenu.api.id,
                  name: contextMenu.api.name,
                });
                setContextMenu(null);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-white/75 hover:bg-white/10 hover:text-white"
            >
              Rename
            </button>
          )}
          <button
            type="button"
            onClick={deleteContextTarget}
            className="block w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200"
          >
            Delete
          </button>
        </div>
      )}
      {collectionDialog.open && (
        <div
          onClick={() =>
            setCollectionDialog({
              open: false,
              mode: "create",
              oldName: "",
              name: "",
            })
          }
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-5">
          <div onClick={(e) => e.stopPropagation()} className="w-[380px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="text-base font-semibold text-white">
              {collectionDialog.mode === "create" ? "Create collection" : "Rename collection"}
            </div>
            <input
              autoFocus
              value={collectionDialog.name}
              onChange={(event) =>
                setCollectionDialog((dialog) => ({
                  ...dialog,
                  name:
                    event.target.value,
                }))
              }
              className="mt-4 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none"
              placeholder="Collection name"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setCollectionDialog({
                    open: false,
                    mode: "create",
                    oldName: "",
                    name: "",
                  })
                }
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  collectionDialog.mode === "create"
                    ? createCollection(collectionDialog.name)
                    : renameCollectionAction()
                }
                className="rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {folderDialog.open && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/55 px-5">
          <div className="w-[420px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="text-base font-semibold text-white">
              {folderDialog.mode === "create" ? "Create folder" : "Rename folder"}
            </div>
            <div className="mt-3 text-xs uppercase tracking-wide text-white/35">
              {folderDialog.collection}
              {folderDialog.parentPath ? ` / ${folderDialog.parentPath}` : ""}
            </div>
            <input
              autoFocus
              value={folderDialog.name}
              onChange={(event) =>
                setFolderDialog((dialog) => ({
                  ...dialog,
                  name:
                    event.target.value,
                }))
              }
              className="mt-3 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
              placeholder="Folder name"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setFolderDialog({
                    open: false,
                    mode: "create",
                    collection: "Default",
                    parentPath: "",
                    folderPath: "",
                    name: "",
                  })
                }
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  folderDialog.mode === "create"
                    ? createFolder(
                      folderDialog.collection,
                      folderDialog.parentPath,
                      folderDialog.name
                    )
                    : renameFolderAction()
                }
                className="rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {apiDialog.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5">
          <div className="w-[380px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="text-base font-semibold text-white">
              Rename API
            </div>
            <input
              autoFocus
              value={apiDialog.name}
              onChange={(event) =>
                setApiDialog((dialog) => ({
                  ...dialog,
                  name: event.target.value,
                }))
              }
              className="mt-4 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
              placeholder="API name"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setApiDialog({
                    open: false,
                    apiId: "",
                    name: "",
                  })
                }
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (apiDialog.name.trim()) {
                    await RenameSavedAPI(apiDialog.apiId, apiDialog.name.trim());
                    setApiDialog({ open: false, apiId: "", name: "" });
                    await refreshSavedAPIs();
                  }
                }}
                className="rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {environmentEditorOpen && editingEnvironment && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeEnvironmentEditor();
            }
          }}
        >
          <div className="w-[760px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="flex items-center justify-between">
              <input
                value={editingEnvironment.name}
                onChange={(event) =>
                  updateEnvironmentEditorDraft({
                    ...editingEnvironment,
                    name:
                      event.target.value,
                  })
                }
                className="h-9 min-w-0 flex-1 bg-transparent text-base font-semibold text-white outline-none"
              />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={exportEnvironmentStore}
                  className="inline-flex h-8 items-center rounded-[4px] px-2 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
                >
                  Export
                </button>
                <button
                  type="button"
                  onClick={closeEnvironmentEditor}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-hidden rounded-[4px] border border-gray-2">
              <div className="grid grid-cols-2 border-b border-gray-2 bg-white/5 text-sm font-semibold text-white/60">
                <div className="border-r border-gray-2 px-3 py-2">Variable</div>
                <div className="px-3 py-2">Value</div>
              </div>
              {editingEnvironment.variables.map((variable) => (
                <div key={variable.id} className="grid grid-cols-2 border-b border-gray-2 last:border-b-0">
                  <input
                    value={variable.key}
                    onChange={(event) =>
                      updateEnvironmentEditorDraft({
                        ...editingEnvironment,
                        variables:
                          editingEnvironment.variables.map((item) =>
                            item.id === variable.id
                              ? {
                                ...item,
                                key:
                                  event.target.value,
                              }
                              : item
                          ),
                      })
                    }
                    className="h-9 border-r border-gray-2 bg-transparent px-3 text-sm text-white outline-none"
                    placeholder="Variable"
                  />
                  <input
                    value={variable.value}
                    onChange={(event) =>
                      updateEnvironmentEditorDraft({
                        ...editingEnvironment,
                        variables:
                          editingEnvironment.variables.map((item) =>
                            item.id === variable.id
                              ? {
                                ...item,
                                value:
                                  event.target.value,
                              }
                              : item
                          ),
                      })
                    }
                    className="h-9 bg-transparent px-3 text-sm text-white outline-none"
                    placeholder="Value"
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  updateEnvironmentEditorDraft({
                    ...editingEnvironment,
                    variables: [
                      ...editingEnvironment.variables,
                      {
                        id:
                          `variable-${Date.now()}`,
                        key:
                          "",
                        value:
                          "",
                      },
                    ],
                  })
                }
                className="block h-9 w-full px-3 text-left text-sm text-white/45 hover:bg-white/10 hover:text-white"
              >
                Add variable
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeEnvironmentEditor}
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEnvironmentEditorDraft}
                className="rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {cloudDialogOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 px-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCloudDialogOpen(false);
            }
          }}
        >
          <div className="w-[480px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-white">Google Drive Sync</div>
                <div className="mt-1 text-xs text-white/45">
                  Collection data syncs to Google Drive appdata. Environment data stays local.
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCloudSettingsOpen((open) => !open)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-white/60 hover:bg-white/10 hover:text-white"
                  title="Google Drive settings"
                >
                  <Settings size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setCloudDialogOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-white/60 hover:bg-white/10 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            {cloudSettingsOpen && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm font-semibold text-white/70">
                  Account email
                  <input
                    value={googleConfig.accountEmail}
                    onChange={(event) =>
                      setGoogleConfig((config) => ({
                        ...config,
                        accountEmail:
                          event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
                    placeholder="Label only"
                  />
                </label>
                <label className="block text-sm font-semibold text-white/70">
                  Client ID
                  <input
                    value={googleConfig.clientId}
                    onChange={(event) =>
                      setGoogleConfig((config) => ({
                        ...config,
                        clientId:
                          event.target.value,
                      }))
                    }
                    className="mt-1 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
                  />
                </label>
                <label className="block text-sm font-semibold text-white/70">
                  Client secret
                  <input
                    value={googleConfig.clientSecret}
                    onChange={(event) =>
                      setGoogleConfig((config) => ({
                        ...config,
                        clientSecret:
                          event.target.value,
                      }))
                    }
                    type="password"
                    className="mt-1 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
                    placeholder="Leave empty to keep current secret"
                  />
                </label>
                <div className="flex justify-end">
                  <button type="button" onClick={saveGoogleDriveSettings} className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white">
                    Save settings
                  </button>
                </div>
              </div>
            )}
            <div className="mt-4 rounded-[4px] border border-gray-2 bg-black-1 p-3 text-sm text-white/65">
              <div>Status: <span className="font-semibold text-white">{cloudSyncState.status}</span></div>
              {googleConfig.accountEmail && (
                <div className="mt-1">
                  Account: <span className="font-semibold text-white">{googleConfig.accountEmail}</span>
                </div>
              )}
              {cloudSyncState.message && <div className="mt-1">{cloudSyncState.message}</div>}
              <div className="mt-1 text-xs text-white/40">
                Local v{cloudSyncState.localVersion || 0} / Cloud v{cloudSyncState.cloudVersion || 0}
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              {!googleDriveConnected && (
                <button type="button" onClick={requestGoogleDriveAccess} className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/70 hover:bg-white/10 hover:text-white">
                  Connect
                </button>
              )}
              {googleDriveConnected && cloudSyncState.status === "pull_available" && (
                <button
                  type="button"
                  onClick={pullFromGoogleDrive}
                  disabled={!!cloudActionLoading}
                  className="inline-flex items-center gap-2 rounded-[4px] bg-amber-500/80 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-500 disabled:cursor-default disabled:opacity-70"
                >
                  {cloudActionLoading === "pull" && (
                    <span className="h-4 w-4 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
                  )}
                  <span>Pull</span>
                </button>
              )}
              {googleDriveConnected && cloudSyncState.status === "pending" && (
                <button
                  type="button"
                  onClick={syncToGoogleDrive}
                  disabled={!!cloudActionLoading}
                  className="inline-flex items-center gap-2 rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1 disabled:cursor-default disabled:opacity-70"
                >
                  {cloudActionLoading === "push" && (
                    <span className="h-4 w-4 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
                  )}
                  <span>Push</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {saveDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSaveDialogOpen(false);
            }
          }}
        >
          <div className="w-[460px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-white">
                Save API
              </div>
              <button
                type="button"
                onClick={() => setSaveDialogOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-white/70">
                File name
                <input
                  value={saveDialogDraft.name}
                  onChange={(event) =>
                    setSaveDialogDraft((draft) => ({
                      ...draft,
                      name:
                        event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
                />
              </label>
              <div className="block text-sm font-semibold text-white/70">
                <div className="flex items-center justify-between">
                  <span>Location</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setCollectionDialog({
                          open: true,
                          mode: "create",
                          oldName: "",
                          name: "",
                        })
                      }
                      className="inline-flex h-7 px-2 items-center justify-center rounded-[4px] bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                      title="New collection"
                    >
                      + Collection
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFolderDialog({
                          open: true,
                          mode: "create",
                          collection:
                            saveDialogDraft.collection || "Default",
                          parentPath:
                            saveDialogDraft.folder,
                          folderPath: "",
                          name: "",
                        })
                      }
                      className="inline-flex h-7 px-2 items-center justify-center rounded-[4px] bg-white/10 text-white/70 hover:bg-white/15 hover:text-white"
                      title="New folder"
                    >
                      + Folder
                    </button>
                  </div>
                </div>
                <div className="mt-2">
                  {renderSaveLocationPicker()}
                </div>
                <datalist id="collection-options">
                  {existingCollections.map((collection) => (
                    <option
                      key={collection}
                      value={collection}
                    />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setSaveDialogOpen(false)
                }
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  saveActiveTab()
                }
                className="rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
      {bugReportOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setBugReportOpen(false);
            }
          }}
        >
          <div className="w-[520px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-white">
                Report bug
              </div>
              <button
                type="button"
                onClick={() => setBugReportOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[4px] text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold text-white/70">
                <span className="flex items-center justify-between gap-2">
                  <span>Title</span>
                  <span className="text-xs text-white/35">
                    {bugReportDraft.title.length}/100
                  </span>
                </span>
                <input
                  value={bugReportDraft.title}
                  maxLength={100}
                  onChange={(event) =>
                    setBugReportDraft((draft) => ({
                      ...draft,
                      title:
                        event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
                />
              </label>
              <label className="block text-sm font-semibold text-white/70">
                Bug description
                <textarea
                  value={bugReportDraft.description}
                  maxLength={2000}
                  onChange={(event) =>
                    setBugReportDraft((draft) => ({
                      ...draft,
                      description:
                        event.target.value,
                    }))
                  }
                  className="mt-1 min-h-[130px] w-full resize-y rounded-[4px] border border-gray-1 bg-gray-3 px-2 py-2 text-white outline-none focus:border-green-1"
                />
                <div className="mt-1 text-right text-xs text-white/35">
                  {bugReportDraft.description.length}/2000
                </div>
              </label>
              <label className="block text-sm font-semibold text-white/70">
                Device / OS
                <input
                  value={bugReportDraft.deviceOs}
                  maxLength={100}
                  onChange={(event) =>
                    setBugReportDraft((draft) => ({
                      ...draft,
                      deviceOs:
                        event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-white outline-none focus:border-green-1"
                />
                <div className="mt-1 text-right text-xs text-white/35">
                  {bugReportDraft.deviceOs.length}/100
                </div>
              </label>
              <div className="text-sm font-semibold text-white/70">
                Tags
                <div className="mt-2 flex flex-wrap gap-2">
                  {bugReportTagOptions.map((tag) => {
                    const checked =
                      bugReportDraft.tags.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => toggleBugReportTag(tag.id)}
                        className={`rounded-[4px] border px-2.5 py-1 text-sm font-semibold transition-colors ${
                          checked
                            ? "border-green-1/60 bg-green-1/20 text-green-100"
                            : "border-gray-1 bg-gray-3 text-white/60 hover:border-white/25 hover:text-white"
                        }`}
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="text-sm font-semibold text-white/70">
                Attachments
                <div className="mt-2 rounded-[4px] border border-gray-1/70 bg-black-1 p-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-medium text-white/40">
                      Images/videos, max 3 files, 10MB each
                    </span>
                    <button
                      type="button"
                      onClick={attachBugReportFile}
                      disabled={bugReportDraft.attachments.length >= 3}
                      className="inline-flex h-7 items-center gap-1.5 rounded-[4px] bg-white/10 px-2 text-xs font-semibold text-white/70 hover:bg-white/15 hover:text-white disabled:cursor-default disabled:opacity-45"
                    >
                      <Upload size={14} />
                      Attach
                    </button>
                  </div>
                  {bugReportDraft.attachments.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {bugReportDraft.attachments.map((attachment) => (
                        <div
                          key={attachment.path}
                          className="flex items-center gap-2 rounded-[4px] bg-white/5 px-2 py-1.5 text-xs text-white/70"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {attachment.name}
                          </span>
                          <span className="shrink-0 text-white/35">
                            {formatResponseSize(attachment.size)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeBugReportAttachment(attachment.path)}
                            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-white/45 hover:bg-white/10 hover:text-white"
                            title="Remove attachment"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBugReportOpen(false)}
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitBugReport}
                disabled={bugReportSubmitting}
                className="inline-flex items-center gap-2 rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1 disabled:cursor-default disabled:opacity-70"
              >
                {bugReportSubmitting && (
                  <span className="h-4 w-4 rounded-full border-2 border-white/80 border-t-transparent animate-spin" />
                )}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2">
        {appToasts.map((toast) => (
          <div
            key={toast.id}
            onClick={() =>
              setAppToasts((items) =>
                items.filter((item) =>
                  item.id !== toast.id
                )
              )
            }
            role="button"
            tabIndex={0}
            className={`rounded-[6px] border px-3 py-2 text-sm shadow-2xl ${
              toast.type === "success"
                ? "border-green-1/40 bg-green-1/15 text-green-100"
                : "cursor-pointer border-red-500/40 bg-red-500/15 text-red-100"
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Home;
