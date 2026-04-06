// src/reducers/dashboardReducer.js
import { ACTION_TYPES } from "./actionTypes";

/**
 * dashboardReducer
 * -------------------------------------------------------
 * Global reducer that updates shared app state
 * for profile, workspaces, documents, deleted users, etc.
 * Used inside DashboardProvider.
 * -------------------------------------------------------
 */
export function dashboardReducer(state, action) {
  switch (action.type) {
    // ==================== PROFILE ====================
    case ACTION_TYPES.SET_PROFILE_LOADING:
      return {
        ...state,
        profile: { ...state.profile, loading: action.payload },
      };

    case ACTION_TYPES.SET_PROFILE_DATA:
      return {
        ...state,
        profile: { data: action.payload, loading: false, error: null },
      };

    case ACTION_TYPES.SET_PROFILE_ERROR:
      return {
        ...state,
        profile: { ...state.profile, loading: false, error: action.payload },
      };

    // ==================== WORKSPACES ====================
    case ACTION_TYPES.SET_WORKSPACES_LOADING:
      return {
        ...state,
        workspaces: { ...state.workspaces, loading: action.payload },
      };

    case ACTION_TYPES.SET_WORKSPACES_DATA:
      return {
        ...state,
        workspaces: { list: action.payload, loading: false, error: null },
      };

    case ACTION_TYPES.ADD_WORKSPACE:
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          list: [...state.workspaces.list, action.payload],
        },
      };

    case ACTION_TYPES.REMOVE_WORKSPACE:
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          list: state.workspaces.list.filter(
            (workspace) => workspace._id !== action.payload
          ),
        },
      };

    case ACTION_TYPES.UPDATE_WORKSPACE:
      return {
        ...state,
        workspaces: {
          ...state.workspaces,
          list: state.workspaces.list.map((ws) =>
            ws._id === action.payload.workspaceId
              ? { ...ws, ...action.payload.updatedWorkspace }
              : ws
          ),
        },
      };

    // ==================== DOCUMENTS ====================
    case ACTION_TYPES.SET_DOCUMENTS_LOADING:
      return {
        ...state,
        documents: { ...state.documents, loading: action.payload },
      };

    case ACTION_TYPES.SET_DOCUMENTS_DATA:
      return {
        ...state,
        documents: { list: action.payload, loading: false, error: null },
      };

    case ACTION_TYPES.ADD_DOCUMENT:
      return {
        ...state,
        documents: {
          ...state.documents,
          list: [...state.documents.list, action.payload],
        },
      };

    case ACTION_TYPES.REMOVE_DOCUMENT:
      return {
        ...state,
        documents: {
          ...state.documents,
          list: state.documents.list.filter(
            (doc) => doc._id !== action.payload
          ),
        },
      };

    case ACTION_TYPES.UPDATE_DOCUMENT:
      return {
        ...state,
        documents: {
          ...state.documents,
          list: state.documents.list.map((doc) =>
            doc._id === action.payload.documentId
              ? { ...doc, ...action.payload.updatedDocument }
              : doc
          ),
        },
      };

    // ==================== RECYCLE BIN ====================
    case ACTION_TYPES.SET_RECYCLE_BIN_DATA:
      return {
        ...state,
        recycleBin: { list: action.payload, loading: false, error: null },
      };

    case ACTION_TYPES.REMOVE_FROM_RECYCLE_BIN:
      return {
        ...state,
        recycleBin: {
          ...state.recycleBin,
          list: state.recycleBin.list.filter(
            (doc) => doc._id !== action.payload
          ),
        },
      };

    // ==================== DELETED USERS ====================
    case ACTION_TYPES.SET_DELETED_USERS_DATA:
      return {
        ...state,
        deletedUsers: { list: action.payload, loading: false, error: null },
      };

    case ACTION_TYPES.REMOVE_DELETED_USER:
      return {
        ...state,
        deletedUsers: {
          ...state.deletedUsers,
          list: state.deletedUsers.list.filter((u) => u._id !== action.payload),
        },
      };

    // ==================== COLLABORATORS ====================
    case ACTION_TYPES.SET_COLLABORATORS_LOADING:
      return {
        ...state,
        collaborators: { ...state.collaborators, loading: action.payload },
      };

    case ACTION_TYPES.SET_COLLABORATORS_DATA:
      return {
        ...state,
        collaborators: { list: action.payload, loading: false, error: null },
      };

    case ACTION_TYPES.SET_COLLABORATORS_ERROR:
      return {
        ...state,
        collaborators: {
          ...state.collaborators,
          loading: false,
          error: action.payload,
        },
      };

    // ==================== SEARCH ====================
    case ACTION_TYPES.SET_SEARCH_TERM:
      return {
        ...state,
        search: { ...state.search, term: action.payload },
      };

    case ACTION_TYPES.SET_FILTERED_DOCUMENTS:
      return {
        ...state,
        search: { ...state.search, filteredDocuments: action.payload },
      };

    case ACTION_TYPES.SET_FILTERED_WORKSPACES:
      return {
        ...state,
        search: { ...state.search, filteredWorkspaces: action.payload },
      };

    // ==================== UI STATE ====================
    case ACTION_TYPES.SET_PREVIEW_FILE:
      return {
        ...state,
        ui: { ...state.ui, previewFile: action.payload },
      };

    case ACTION_TYPES.SET_SHOW_PREVIEW_MODAL:
      return {
        ...state,
        ui: { ...state.ui, showPreviewModal: action.payload },
      };

    case ACTION_TYPES.SET_SELECTED_WORKSPACE:
      return {
        ...state,
        ui: { ...state.ui, selectedWorkspace: action.payload },
      };

    case ACTION_TYPES.SET_SELECTED_ROLE:
      return {
        ...state,
        ui: { ...state.ui, selectedRole: action.payload },
      };

    // ==================== LOADING STATES ====================
    case ACTION_TYPES.SET_LOADING_STATE:
      return {
        ...state,
        loadingStates: {
          ...state.loadingStates,
          [action.payload.key]: action.payload.isLoading,
        },
      };

    // ==================== AUTH (OPTIONAL) ====================
    case ACTION_TYPES.SET_AUTH_STATE:
      return {
        ...state,
        auth: { ...state.auth, ...action.payload },
      };

    // ==================== DEFAULT ====================
    default:
      return state;
  }
}
