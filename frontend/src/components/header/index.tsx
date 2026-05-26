import { useEffect, useMemo, useState, useRef } from 'react';
import logo from '../../assets/images/logo/logo.svg';
import sizeDown from '../../assets/icons/size-down.svg';
import { AlertTriangle, Briefcase, ChevronDown, LockKeyhole, Minus, MoreHorizontal, Search, Square, Trash2, Users, X } from 'lucide-react';
import {
  CreateWorkspace,
  DeleteWorkspace,
  GetActiveWorkspace,
  ListWorkspaces,
  SwitchWorkspace,
} from '../../../wailsjs/go/main/App';
import { WindowMinimise, WindowToggleMaximise, Quit } from '../../../wailsjs/runtime/runtime';

type Workspace = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export const Header: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspace] = useState<Workspace | null>(null);
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [workspaceDialogError, setWorkspaceDialogError] = useState("");
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceMenuId, setWorkspaceMenuId] = useState<string | null>(null);
  const [workspaceMenuCoords, setWorkspaceMenuCoords] = useState<{ top: number; left: number } | null>(null);
  const [deleteWorkspaceTarget, setDeleteWorkspaceTarget] = useState<Workspace | null>(null);

  const workspaceContainerRef = useRef<HTMLDivElement>(null);

  const handleMinimize = () => WindowMinimise();

  const handleMaximize = () => {
    WindowToggleMaximise();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => Quit();

  function getWorkspaceErrorMessage(error: unknown) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : error &&
            typeof error === "object" &&
            "message" in error &&
            typeof (error as { message?: unknown }).message === "string"
            ? (error as { message: string }).message
            : "";

    const message =
      rawMessage.replace(/^Error:\s*/i, "").trim();

    if (message.includes("workspace name already exists")) {
      return "Workspace already exists.";
    }

    return message || "Unable to complete this action.";
  }

  const filteredWorkspaces = useMemo(
    () => {
      const keyword =
        workspaceSearch.trim().toLowerCase();

      if (!keyword) {
        return workspaces;
      }

      return workspaces.filter((workspace) =>
        workspace.name.toLowerCase().includes(keyword)
      );
    },
    [
      workspaceSearch,
      workspaces,
    ]
  );

  async function refreshWorkspaces() {
    try {
      const [items, active] =
        await Promise.all([
          ListWorkspaces(),
          GetActiveWorkspace(),
        ]);

      setWorkspaces((items ?? []) as Workspace[]);
      setActiveWorkspace(active as Workspace);
    } catch {
      setWorkspaces([]);
      setActiveWorkspace(null);
    }
  }

  async function selectWorkspace(workspace: Workspace) {
    if (workspace.id === activeWorkspace?.id) {
      setWorkspaceOpen(false);
      return;
    }

    const nextWorkspace =
      await SwitchWorkspace(workspace.id);
    setActiveWorkspace(nextWorkspace as Workspace);
    await refreshWorkspaces();
    setWorkspaceOpen(false);
    window.dispatchEvent(
      new CustomEvent(
        "graph-space-workspace-changed",
        {
          detail:
            nextWorkspace,
        }
      )
    );
  }

  async function createWorkspace() {
    const value =
      newWorkspaceName.trim();

    if (!value) {
      return;
    }

    let workspace: unknown;
    try {
      workspace =
        await CreateWorkspace(value);
      setWorkspaceDialogError("");
    } catch (error) {
      setWorkspaceDialogError(
        getWorkspaceErrorMessage(error)
      );
      return;
    }
    setNewWorkspaceName("");
    setWorkspaceSearch("");
    await refreshWorkspaces();
    setActiveWorkspace(workspace as Workspace);
    setWorkspaceOpen(false);
    setCreateWorkspaceOpen(false);
    window.dispatchEvent(
      new CustomEvent(
        "graph-space-workspace-changed",
        {
          detail:
            workspace,
        }
      )
    );
  }

  async function deleteWorkspace() {
    if (!deleteWorkspaceTarget) {
      return;
    }

    const deletedActive =
      deleteWorkspaceTarget.id === activeWorkspace?.id;
    const nextWorkspace =
      await DeleteWorkspace(deleteWorkspaceTarget.id);

    setDeleteWorkspaceTarget(null);
    setWorkspaceMenuId(null);
    await refreshWorkspaces();

    if (deletedActive) {
      setActiveWorkspace(nextWorkspace as Workspace);
      window.dispatchEvent(
        new CustomEvent(
          "graph-space-workspace-changed",
          {
            detail:
              nextWorkspace,
          }
        )
      );
    }
  }

  useEffect(() => {
    refreshWorkspaces();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        workspaceContainerRef.current &&
        !workspaceContainerRef.current.contains(event.target as Node)
      ) {
        setWorkspaceOpen(false);
        setWorkspaceMenuId(null);
        setWorkspaceMenuCoords(null);
      } else {
        const target = event.target as HTMLElement;
        if (
          workspaceMenuId &&
          !target.closest('.workspace-options-menu') &&
          !target.closest('.workspace-options-btn')
        ) {
          setWorkspaceMenuId(null);
          setWorkspaceMenuCoords(null);
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [workspaceMenuId]);

  return (
    <header
      className="flex justify-between items-center h-[50px] pr-3 pl-2.5 w-full bg-black-1 border-b border-b-gray-2"
      style={{ '--wails-draggable': 'drag' } as React.CSSProperties}
    >
      {/* Logo */}
      <div className="relative flex items-center gap-2">
        <img
          src={logo}
          className="w-[28px] h-[28px]"
        />
        <div
          ref={workspaceContainerRef}
          style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
        >
          <button
            type="button"
            onClick={() =>
              setWorkspaceOpen((value) => !value)
            }
            className={`
              inline-flex h-8 max-w-[240px] items-center text-base gap-2 rounded-[4px] border px-2.5 font-medium text-white/85 transition
              ${workspaceOpen
                ? "border-gray-1 bg-gray-2/30"
                : "border-transparent hover:border-gray-1/60 hover:bg-gray-2/30"
              }
            `}
          >
            {/* <Briefcase size={15} className="shrink-0 text-green-1" /> */}
            <span className="min-w-0 truncate">
              {activeWorkspace?.name ?? "My Workspace"}
            </span>
            <ChevronDown size={14} className="shrink-0 text-white/60" />
          </button>
          {workspaceOpen && (
            <div className="absolute left-9 top-[40px] z-[80] w-[390px] rounded-[4px] border border-gray-1 bg-black-2 p-4 text-left shadow-2xl">
              <div className="flex items-center gap-2">
                <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-[4px] border border-gray-1 bg-black-1 px-2 focus-within:border-green-1/70">
                  <Search size={15} className="shrink-0 text-white/60" />
                  <input
                    value={workspaceSearch}
                    onChange={(event) =>
                      setWorkspaceSearch(event.target.value)
                    }
                    placeholder="Search workspace"
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/60"
                  />
                </div>
                  <button
                    type="button"
                    onClick={() => {
                      setNewWorkspaceName("");
                      setWorkspaceDialogError("");
                      setCreateWorkspaceOpen(true);
                    }}
                  className="inline-flex h-8 shrink-0 items-center justify-center rounded-[4px] bg-gray-2 px-3 text-sm font-semibold text-white hover:bg-gray-2/80"
                >
                  Create Workspace
                </button>
              </div>
              <div
                className="mt-3 max-h-[260px] overflow-y-auto"
                onScroll={() => {
                  if (workspaceMenuId) {
                    setWorkspaceMenuId(null);
                    setWorkspaceMenuCoords(null);
                  }
                }}
              >
                {filteredWorkspaces.length === 0 ? (
                  <div className="px-2 py-7 text-center text-sm text-white/35">
                    No workspace found
                  </div>
                ) : (
                  filteredWorkspaces.map((workspace, index) => {
                    const active =
                      workspace.id === activeWorkspace?.id;

                    return (
                      <div
                        key={workspace.id}
                        className="relative"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            selectWorkspace(workspace)
                          }
                          className={`
                            group flex h-9 w-full items-center gap-2 rounded-[4px] border px-2 pr-8 text-left text-sm text-white hover:bg-gray-2/30
                            ${active
                              ? "border-blue-500 bg-transparent"
                              : "border-transparent"
                            }
                          `}
                        >
                          {/* {index === 0 ? (
                            <LockKeyhole size={15} className="shrink-0 text-white/80" />
                          ) : (
                            <Users size={16} className="shrink-0 text-white/80" />
                          )} */}
                          <span className="min-w-0 truncate">
                            {workspace.name}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (workspaceMenuId === workspace.id) {
                              setWorkspaceMenuId(null);
                              setWorkspaceMenuCoords(null);
                            } else {
                              const rect = event.currentTarget.getBoundingClientRect();
                              setWorkspaceMenuId(workspace.id);
                              setWorkspaceMenuCoords({
                                top: rect.bottom + 4,
                                left: rect.right - 150,
                              });
                            }
                          }}
                          className="workspace-options-btn absolute right-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-[4px] text-white/45 hover:bg-white/10 hover:text-white"
                          title="Workspace options"
                        >
                          <MoreHorizontal size={16} />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              {workspaceMenuId && workspaceMenuCoords && (
                <div
                  style={{
                    position: 'fixed',
                    top: workspaceMenuCoords.top,
                    left: workspaceMenuCoords.left,
                  }}
                  className="workspace-options-menu z-[100] w-[150px] rounded-[4px] border border-gray-1 bg-black-2 py-1 shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      const targetWorkspace = workspaces.find((w) => w.id === workspaceMenuId);
                      if (targetWorkspace) {
                        setDeleteWorkspaceTarget(targetWorkspace);
                      }
                      setWorkspaceMenuId(null);
                      setWorkspaceMenuCoords(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-300 hover:bg-red-500/10 hover:text-red-200"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {createWorkspaceOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-5"
          style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCreateWorkspaceOpen(false);
            }
          }}
        >
          <div className="w-[380px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="text-base font-semibold text-white">
              Create Workspace
            </div>
            <input
              autoFocus
              value={newWorkspaceName}
              onChange={(event) =>
                setNewWorkspaceName(event.target.value)
              }
              onInput={() =>
                setWorkspaceDialogError("")
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  createWorkspace();
                }
              }}
              placeholder="Workspace name"
              className="mt-4 h-9 w-full rounded-[4px] border border-gray-1 bg-gray-3 px-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-green-1"
            />
            {workspaceDialogError && (
              <div className="mt-2 text-sm text-red-300">
                {workspaceDialogError}
              </div>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setCreateWorkspaceOpen(false)
                }
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createWorkspace}
                disabled={!newWorkspaceName.trim()}
                className="rounded-[4px] bg-green-1/75 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-1 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/30"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      {deleteWorkspaceTarget && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 px-5"
          style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setDeleteWorkspaceTarget(null);
            }
          }}
        >
          <div className="w-[430px] max-w-[calc(100vw-40px)] rounded-[6px] border border-gray-1 bg-black-2 p-5 text-left shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] bg-red-500/10 text-red-300">
                <AlertTriangle size={18} />
              </span>
              <div className="min-w-0">
                <div className="text-base font-semibold text-white">
                  Delete workspace?
                </div>
                <div className="mt-2 text-sm leading-6 text-white/60">
                  If you delete workspace "{deleteWorkspaceTarget.name}", all collections, folders, and saved APIs in this workspace will be permanently deleted and cannot be recovered.
                </div>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setDeleteWorkspaceTarget(null)
                }
                className="rounded-[4px] px-3 py-1.5 text-sm font-semibold text-white/60 hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={deleteWorkspace}
                className="rounded-[4px] bg-red-500/80 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-500"
              >
                Delete workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Window Controls */}
      <div
        className="flex items-center gap-2"
        style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
      >
        {/* Minimize */}
        <Minus onClick={handleMinimize} size={20} className='cursor-pointer mt-2.5'/>

        {/* Maximize */}
        <button
          onClick={handleMaximize}
          className="
            w-10 h-10
            flex items-center justify-center
            text-white
            transition-all duration-200
          ">
          {isMaximized ? (
            <img
              src={sizeDown}
              className="w-[14px] h-[14px]"
            />
          ) : <Square size={16}/>}
        </button>

        {/* Close */}
        <X onClick={handleClose} className='text-white/80 cursor-pointer'/>
      </div>
    </header>
  );
};
