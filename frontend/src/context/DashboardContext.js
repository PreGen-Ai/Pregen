// src/context/DashboardContext.js
import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import PropTypes from "prop-types";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuthContext } from "./AuthContext";

// Create context with proper default value
const DashboardContext = createContext(undefined);

// API Configuration
const API_CONFIG = {
  baseURL:
    window.location.hostname === "localhost"
      ? "http://localhost:4000"
      : window.location.hostname.includes("preprod")
      ? "https://pregen.onrender.com"
      : "https://pregen.onrender.com",
  withCredentials: true,
};

// Create axios instance with interceptors
const createApiService = () => {
  const axiosInstance = axios.create(API_CONFIG);

  // Request interceptor to add JWT token
  axiosInstance.interceptors.request.use(
    (config) => {
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      console.log("API Request:", {
        url: config.url,
        method: config.method,
        headers: config.headers,
        hasToken: !!token,
      });
      return config;
    },
    (error) => {
      return Promise.reject(error);
    }
  );

  // Response interceptor to handle auth errors
  axiosInstance.interceptors.response.use(
    (response) => {
      console.log("API Response Success:", {
        url: response.config.url,
        status: response.status,
        data: response.data,
      });
      return response;
    },
    (error) => {
      console.log("API Response Error:", {
        url: error.config?.url,
        status: error.response?.status,
        message: error.message,
      });

      if (error.response?.status === 401) {
        // Token expired or invalid
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
        console.error("Authentication failed - token invalid or expired");
        toast.error("Your session has expired. Please log in again.");

        // Optional: Redirect to login page
        // window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );

  return axiosInstance;
};

// API Service Abstraction
const apiService = {
  axiosInstance: createApiService(),

  // Profile
  getProfile: (userId) =>
    apiService.axiosInstance.get(`/api/users/profile/${userId}`),

  updateProfile: (userId, updates) =>
    apiService.axiosInstance.put(`/api/users/profile/${userId}`, updates),

  // Workspaces
  createWorkspace: (workspaceData) =>
    apiService.axiosInstance.post(`/api/workspaces/create`, workspaceData),

  getWorkspacesByUser: (userId) =>
    apiService.axiosInstance.get(`/api/workspaces/${userId}`),

  deleteWorkspace: (workspaceId) =>
    apiService.axiosInstance.delete(
      `/api/workspaces/deleteWorkspace/${workspaceId}`
    ),

  getCollaborators: (workspaceId) =>
    apiService.axiosInstance.get(
      `/api/workspaces/${workspaceId}/collaborators`
    ),

  addCollaborator: (workspaceId, collaboratorData) =>
    apiService.axiosInstance.post(
      `/api/workspaces/${workspaceId}/add-collaborator`,
      collaboratorData
    ),

  searchWorkspaces: (term) =>
    apiService.axiosInstance.get(`/api/workspaces/search?q=${term}`),

  // Documents
  getDocuments: (workspaceId) =>
    apiService.axiosInstance.get(`/api/documents/${workspaceId}/documents`),

  uploadDocument: (formData) =>
    apiService.axiosInstance.post(`/api/documents/upload`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),

  softDeleteDocument: (documentId) =>
    apiService.axiosInstance.put(`/api/documents/${documentId}/soft-delete`, {
      deleted: true,
    }),

  downloadDocument: (documentId) =>
    apiService.axiosInstance.get(`/api/documents/download/${documentId}`, {
      responseType: "blob",
    }),

  restoreDocument: (documentId) =>
    apiService.axiosInstance.put(`/api/documents/${documentId}/restore`, {
      deleted: false,
    }),

  updateDocumentMetadata: (documentId, metadata) =>
    apiService.axiosInstance.put(
      `/api/documents/${documentId}/metadata`,
      metadata
    ),

  updateDocumentTags: (documentId, tags) =>
    apiService.axiosInstance.put(`/api/documents/${documentId}/tags`, { tags }),

  getDocumentMetadata: (documentId) =>
    apiService.axiosInstance.get(`/api/documents/${documentId}/metadata`),

  searchDocuments: (searchParams) =>
    apiService.axiosInstance.get(`/api/documents/search?${searchParams}`),

  previewDocument: (documentId) =>
    apiService.axiosInstance.get(`/api/documents/preview/${documentId}`),
};

// Helper function to get JWT token
const getJwtToken = () => {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
};

// Helper function to check if user is authenticated
const isUserAuthenticated = () => {
  const token = getJwtToken();
  if (!token) return false;

  try {
    // Basic token validation - check if it's a valid JWT format
    const parts = token.split(".");
    if (parts.length !== 3) return false;

    // Optional: Check token expiration
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      // Token expired
      localStorage.removeItem("token");
      sessionStorage.removeItem("token");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error validating token:", error);
    return false;
  }
};

// Initial State
const initialState = {
  profile: {
    data: null,
    loading: true,
    error: null,
  },
  workspaces: {
    list: [],
    loading: true,
    error: null,
  },
  documents: {
    list: [],
    loading: false,
    error: null,
  },
  recycleBin: {
    list: [],
    loading: false,
    error: null,
  },
  collaborators: {
    list: [],
    loading: false,
    error: null,
  },
  search: {
    term: "",
    filteredDocuments: [],
    filteredWorkspaces: [],
  },
  ui: {
    previewFile: null,
    showPreviewModal: false,
    selectedWorkspace: null,
    selectedRole: "Viewer",
  },
  loadingStates: {
    profile: false,
    workspaces: false,
    documents: false,
    upload: false,
    collaborators: false,
  },
  auth: {
    hasValidToken: isUserAuthenticated(),
    token: getJwtToken(),
  },
};

// Action Types
const ACTION_TYPES = {
  SET_PROFILE_LOADING: "SET_PROFILE_LOADING",
  SET_PROFILE_DATA: "SET_PROFILE_DATA",
  SET_PROFILE_ERROR: "SET_PROFILE_ERROR",

  SET_WORKSPACES_LOADING: "SET_WORKSPACES_LOADING",
  SET_WORKSPACES_DATA: "SET_WORKSPACES_DATA",
  SET_WORKSPACES_ERROR: "SET_WORKSPACES_ERROR",
  ADD_WORKSPACE: "ADD_WORKSPACE",
  REMOVE_WORKSPACE: "REMOVE_WORKSPACE",

  SET_DOCUMENTS_LOADING: "SET_DOCUMENTS_LOADING",
  SET_DOCUMENTS_DATA: "SET_DOCUMENTS_DATA",
  SET_DOCUMENTS_ERROR: "SET_DOCUMENTS_ERROR",
  ADD_DOCUMENT: "ADD_DOCUMENT",
  REMOVE_DOCUMENT: "REMOVE_DOCUMENT",
  UPDATE_DOCUMENT: "UPDATE_DOCUMENT",

  SET_RECYCLE_BIN_DATA: "SET_RECYCLE_BIN_DATA",
  REMOVE_FROM_RECYCLE_BIN: "REMOVE_FROM_RECYCLE_BIN",

  SET_COLLABORATORS_LOADING: "SET_COLLABORATORS_LOADING",
  SET_COLLABORATORS_DATA: "SET_COLLABORATORS_DATA",
  SET_COLLABORATORS_ERROR: "SET_COLLABORATORS_ERROR",

  SET_SEARCH_TERM: "SET_SEARCH_TERM",
  SET_FILTERED_DOCUMENTS: "SET_FILTERED_DOCUMENTS",
  SET_FILTERED_WORKSPACES: "SET_FILTERED_WORKSPACES",

  SET_PREVIEW_FILE: "SET_PREVIEW_FILE",
  SET_SHOW_PREVIEW_MODAL: "SET_SHOW_PREVIEW_MODAL",
  SET_SELECTED_WORKSPACE: "SET_SELECTED_WORKSPACE",
  SET_SELECTED_ROLE: "SET_SELECTED_ROLE",

  SET_LOADING_STATE: "SET_LOADING_STATE",

  SET_AUTH_STATE: "SET_AUTH_STATE",
};

// Reducer
function dashboardReducer(state, action) {
  switch (action.type) {
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
              ? action.payload.updatedDocument
              : doc
          ),
        },
      };

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

    case ACTION_TYPES.SET_COLLABORATORS_DATA:
      return {
        ...state,
        collaborators: { list: action.payload, loading: false, error: null },
      };

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

    case ACTION_TYPES.SET_LOADING_STATE:
      return {
        ...state,
        loadingStates: {
          ...state.loadingStates,
          [action.payload.key]: action.payload.isLoading,
        },
      };

    case ACTION_TYPES.SET_AUTH_STATE:
      return {
        ...state,
        auth: {
          ...state.auth,
          ...action.payload,
        },
      };

    default:
      return state;
  }
}

// Custom Hook for Error Handling
const useErrorHandler = () => {
  const handleError = useCallback((error, defaultMessage, context = {}) => {
    console.error("Dashboard Error:", { error, context, defaultMessage });

    const message = error.response?.data?.message || defaultMessage;

    if (error.response?.status >= 500) {
      toast.error("Server error. Please try again later.");
    } else if (error.response?.status === 401) {
      toast.error("Please log in to continue.");
    } else if (error.response?.status === 403) {
      toast.error("You do not have permission to perform this action.");
    } else {
      toast.error(message);
    }
  }, []);

  return { handleError };
};

export const DashboardProvider = ({ children }) => {
  const { state: authState } = useAuthContext();
  const { user, isAuthenticated } = authState ?? {};

  const [state, dispatch] = useReducer(dashboardReducer, initialState);
  const { handleError } = useErrorHandler();

  // Update auth state when token changes
  useEffect(() => {
    actions.setAuthState({
      hasValidToken: isUserAuthenticated(),
      token: getJwtToken(),
    });
  }, [isAuthenticated]);

  // Action Creators
  const actions = useMemo(
    () => ({
      setProfileLoading: (loading) =>
        dispatch({ type: ACTION_TYPES.SET_PROFILE_LOADING, payload: loading }),

      setProfileData: (data) =>
        dispatch({ type: ACTION_TYPES.SET_PROFILE_DATA, payload: data }),

      setProfileError: (error) =>
        dispatch({ type: ACTION_TYPES.SET_PROFILE_ERROR, payload: error }),

      setWorkspacesLoading: (loading) =>
        dispatch({
          type: ACTION_TYPES.SET_WORKSPACES_LOADING,
          payload: loading,
        }),

      setWorkspacesData: (data) =>
        dispatch({ type: ACTION_TYPES.SET_WORKSPACES_DATA, payload: data }),

      addWorkspace: (workspace) =>
        dispatch({ type: ACTION_TYPES.ADD_WORKSPACE, payload: workspace }),

      removeWorkspace: (workspaceId) =>
        dispatch({ type: ACTION_TYPES.REMOVE_WORKSPACE, payload: workspaceId }),

      setDocumentsData: (data) =>
        dispatch({ type: ACTION_TYPES.SET_DOCUMENTS_DATA, payload: data }),

      addDocument: (document) =>
        dispatch({ type: ACTION_TYPES.ADD_DOCUMENT, payload: document }),

      removeDocument: (documentId) =>
        dispatch({ type: ACTION_TYPES.REMOVE_DOCUMENT, payload: documentId }),

      updateDocument: (documentId, updatedDocument) =>
        dispatch({
          type: ACTION_TYPES.UPDATE_DOCUMENT,
          payload: { documentId, updatedDocument },
        }),

      setRecycleBinData: (data) =>
        dispatch({ type: ACTION_TYPES.SET_RECYCLE_BIN_DATA, payload: data }),

      removeFromRecycleBin: (documentId) =>
        dispatch({
          type: ACTION_TYPES.REMOVE_FROM_RECYCLE_BIN,
          payload: documentId,
        }),

      setCollaboratorsData: (data) =>
        dispatch({ type: ACTION_TYPES.SET_COLLABORATORS_DATA, payload: data }),

      setSearchTerm: (term) =>
        dispatch({ type: ACTION_TYPES.SET_SEARCH_TERM, payload: term }),

      setFilteredDocuments: (documents) =>
        dispatch({
          type: ACTION_TYPES.SET_FILTERED_DOCUMENTS,
          payload: documents,
        }),

      setFilteredWorkspaces: (workspaces) =>
        dispatch({
          type: ACTION_TYPES.SET_FILTERED_WORKSPACES,
          payload: workspaces,
        }),

      setPreviewFile: (file) =>
        dispatch({ type: ACTION_TYPES.SET_PREVIEW_FILE, payload: file }),

      setShowPreviewModal: (show) =>
        dispatch({ type: ACTION_TYPES.SET_SHOW_PREVIEW_MODAL, payload: show }),

      setSelectedWorkspace: (workspace) =>
        dispatch({
          type: ACTION_TYPES.SET_SELECTED_WORKSPACE,
          payload: workspace,
        }),

      setSelectedRole: (role) =>
        dispatch({ type: ACTION_TYPES.SET_SELECTED_ROLE, payload: role }),

      setLoadingState: (key, isLoading) =>
        dispatch({
          type: ACTION_TYPES.SET_LOADING_STATE,
          payload: { key, isLoading },
        }),

      setAuthState: (authData) =>
        dispatch({
          type: ACTION_TYPES.SET_AUTH_STATE,
          payload: authData,
        }),
    }),
    []
  );

  // ============ PROFILE CRUD OPERATIONS ============

  const fetchProfileData = useCallback(async () => {
    if (!user?._id) {
      actions.setProfileLoading(false);
      return;
    }

    // Check if we have a valid token
    if (!isUserAuthenticated()) {
      actions.setProfileError("No valid authentication token found");
      toast.error("Please log in to access your profile");
      return;
    }

    try {
      actions.setProfileLoading(true);
      console.log("Fetching profile with token:", getJwtToken() ? "Yes" : "No");
      const response = await apiService.getProfile(user._id);
      actions.setProfileData(response.data);
    } catch (err) {
      console.error("Error fetching profile data:", err);
      actions.setProfileError("Failed to load profile data");
      handleError(err, "Failed to load profile data");
    } finally {
      actions.setProfileLoading(false);
    }
  }, [user?._id, actions, handleError]);

  const updateProfile = useCallback(
    async (profileUpdates) => {
      try {
        actions.setLoadingState("profile", true);
        const response = await apiService.updateProfile(
          user._id,
          profileUpdates
        );
        actions.setProfileData(response.data);
        toast.success("Profile updated successfully");
        return response.data;
      } catch (err) {
        console.error("Error updating profile:", err);
        handleError(err, "Failed to update profile");
        throw err;
      } finally {
        actions.setLoadingState("profile", false);
      }
    },
    [user?._id, actions, handleError]
  );

  // ============ WORKSPACE CRUD OPERATIONS ============

  const createWorkspace = useCallback(
    async (workspaceData) => {
      try {
        actions.setLoadingState("workspaces", true);
        const response = await apiService.createWorkspace(workspaceData);
        actions.addWorkspace(response.data);
        toast.success("Workspace created successfully.");
        return response.data;
      } catch (error) {
        console.error("Error creating workspace:", error);
        handleError(error, "Failed to create workspace.");
        throw error;
      } finally {
        actions.setLoadingState("workspaces", false);
      }
    },
    [actions, handleError]
  );

  const fetchWorkspacesByUser = useCallback(async () => {
    if (!isAuthenticated || !user) {
      toast.error("You need to log in to fetch workspaces.");
      return;
    }

    // Check if we have a valid token
    if (!isUserAuthenticated()) {
      toast.error("Please log in to access workspaces");
      return;
    }

    try {
      actions.setWorkspacesLoading(true);
      const response = await apiService.getWorkspacesByUser(user._id);
      actions.setWorkspacesData(response.data || []);
    } catch (error) {
      handleError(error, "Failed to fetch workspaces.");
    } finally {
      actions.setWorkspacesLoading(false);
    }
  }, [user, isAuthenticated, actions, handleError]);

  const deleteWorkspace = useCallback(
    async (workspaceId) => {
      try {
        actions.setLoadingState("workspaces", true);
        await apiService.deleteWorkspace(workspaceId);
        actions.removeWorkspace(workspaceId);
        toast.success("Workspace deleted successfully.");
      } catch (error) {
        console.error("Error deleting workspace:", error);
        handleError(error, "Failed to delete workspace.");
        throw error;
      } finally {
        actions.setLoadingState("workspaces", false);
      }
    },
    [actions, handleError]
  );

  // ============ DOCUMENT CRUD OPERATIONS ============

  const fetchDocuments = useCallback(
    async (workspaceId, onlyDeleted = false) => {
      try {
        actions.setLoadingState("documents", true);
        const response = await apiService.getDocuments(workspaceId);
        const allDocuments = response.data || [];

        const filtered = onlyDeleted
          ? allDocuments.filter((doc) => doc.deleted)
          : allDocuments.filter((doc) => !doc.deleted);

        actions.setDocumentsData(filtered);
        actions.setRecycleBinData(allDocuments.filter((doc) => doc.deleted));
      } catch (error) {
        handleError(error, "Failed to fetch documents.");
      } finally {
        actions.setLoadingState("documents", false);
      }
    },
    [actions, handleError]
  );

  const uploadDocument = useCallback(
    async (workspaceId, documentData) => {
      try {
        actions.setLoadingState("upload", true);
        const formData = new FormData();
        formData.append("document", documentData.file);
        formData.append("workspaceId", workspaceId);

        const response = await apiService.uploadDocument(formData);
        actions.addDocument(response.data.document);
        toast.success("Document uploaded successfully.");
        return response.data.document;
      } catch (error) {
        console.error("Error uploading document:", error);
        handleError(
          error,
          error.response?.data?.message || "Failed to upload document."
        );
        throw error;
      } finally {
        actions.setLoadingState("upload", false);
      }
    },
    [actions, handleError]
  );

  const deleteDocument = useCallback(
    async (documentId) => {
      try {
        if (!documentId) {
          throw new Error("Invalid document ID.");
        }
        actions.setLoadingState("documents", true);
        const response = await apiService.softDeleteDocument(documentId);
        const updatedDocument = response.data;
        actions.removeDocument(documentId);
        actions.setRecycleBinData((prev) => [...prev, updatedDocument]);
        toast.success("Document moved to recycle bin.");
      } catch (error) {
        console.error("Error moving document to recycle bin:", error);
        handleError(
          error,
          error.response?.data?.message ||
            "Failed to move document to recycle bin."
        );
        throw error;
      } finally {
        actions.setLoadingState("documents", false);
      }
    },
    [actions, handleError]
  );

  const downloadDocument = useCallback(
    async (documentId, filename) => {
      try {
        if (!documentId) {
          throw new Error("Invalid document ID.");
        }
        const response = await apiService.downloadDocument(documentId);
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        toast.success("Document downloaded successfully.");
      } catch (error) {
        console.error("Error downloading document:", error);
        handleError(
          error,
          error.response?.data?.message || "Failed to download document."
        );
        throw error;
      }
    },
    [handleError]
  );

  const restoreDocument = useCallback(
    async (documentId) => {
      try {
        actions.setLoadingState("documents", true);
        const response = await apiService.restoreDocument(documentId);
        const restoredDocument = response.data;
        actions.removeFromRecycleBin(documentId);
        actions.addDocument(restoredDocument);
        toast.success("Document restored successfully.");
      } catch (error) {
        handleError(error, "Failed to restore document.");
        throw error;
      } finally {
        actions.setLoadingState("documents", false);
      }
    },
    [actions, handleError]
  );

  const updateDocumentMetadata = useCallback(
    async (documentId, metadata) => {
      try {
        actions.setLoadingState("documents", true);
        const response = await apiService.updateDocumentMetadata(
          documentId,
          metadata
        );
        const updatedDocument = response.data;
        actions.updateDocument(documentId, updatedDocument);
        toast.success("Document metadata updated successfully.");
        return updatedDocument;
      } catch (error) {
        console.error("Error updating document metadata:", error);
        handleError(error, "Failed to update document metadata.");
        throw error;
      } finally {
        actions.setLoadingState("documents", false);
      }
    },
    [actions, handleError]
  );

  const updateDocumentTags = useCallback(
    async (documentId, tags) => {
      try {
        actions.setLoadingState("documents", true);
        const response = await apiService.updateDocumentTags(documentId, tags);
        const updatedDocument = response.data;
        actions.updateDocument(documentId, updatedDocument);
        toast.success("Document tags updated successfully.");
        return updatedDocument;
      } catch (error) {
        console.error("Error updating document tags:", error);
        handleError(error, "Failed to update document tags.");
        throw error;
      } finally {
        actions.setLoadingState("documents", false);
      }
    },
    [actions, handleError]
  );

  const getDocumentMetadata = useCallback(
    async (documentId) => {
      try {
        const response = await apiService.getDocumentMetadata(documentId);
        return response.data;
      } catch (error) {
        console.error("Error fetching document metadata:", error);
        handleError(error, "Failed to fetch document metadata.");
        throw error;
      }
    },
    [handleError]
  );

  // ============ COLLABORATION OPERATIONS ============

  const fetchCollaborators = useCallback(
    async (workspaceId) => {
      try {
        if (!workspaceId || !workspaceId.match(/^[0-9a-fA-F]{24}$/)) {
          throw new Error("Invalid workspace ID");
        }
        actions.setLoadingState("collaborators", true);
        const response = await apiService.getCollaborators(workspaceId);

        if (Array.isArray(response.data)) {
          actions.setCollaboratorsData(response.data);
        } else {
          console.error("Invalid data format received for collaborators");
          actions.setCollaboratorsData([]);
        }
      } catch (error) {
        console.error("Error fetching collaborators:", error);
        handleError(error, "Failed to fetch collaborators.");
        actions.setCollaboratorsData([]);
        throw error;
      } finally {
        actions.setLoadingState("collaborators", false);
      }
    },
    [actions, handleError]
  );

  const addCollaboratorToWorkspace = useCallback(
    async (collaboratorUser) => {
      try {
        if (!state.ui.selectedWorkspace || !state.ui.selectedWorkspace._id) {
          throw new Error("No workspace selected");
        }
        if (!collaboratorUser || !collaboratorUser._id) {
          throw new Error("Invalid collaborator details");
        }
        if (
          !state.ui.selectedRole ||
          !["Viewer", "Editor", "Admin"].includes(state.ui.selectedRole)
        ) {
          throw new Error("Invalid role selected");
        }

        await apiService.addCollaborator(state.ui.selectedWorkspace._id, {
          userId: collaboratorUser._id,
          role: state.ui.selectedRole,
        });

        toast.success(
          `${collaboratorUser.username} added as ${state.ui.selectedRole}.`
        );
        await fetchCollaborators(state.ui.selectedWorkspace._id);
      } catch (error) {
        console.error("Error adding collaborator:", error);
        handleError(
          error,
          error.response?.data?.message || "Error adding collaborator."
        );
        throw error;
      }
    },
    [
      state.ui.selectedWorkspace,
      state.ui.selectedRole,
      fetchCollaborators,
      handleError,
    ]
  );

  // ============ SEARCH & PREVIEW OPERATIONS ============

  const searchDocuments = useCallback(
    (term) => {
      actions.setSearchTerm(term);
    },
    [actions]
  );

  const searchDocumentsWithParams = useCallback(
    async (searchParams) => {
      try {
        const { name, metadata, tags } = searchParams;
        const query = new URLSearchParams();

        if (name) query.append("name", name);
        if (metadata) query.append("metadata", metadata);
        if (tags) query.append("tags", tags);

        const response = await apiService.searchDocuments(query.toString());
        actions.setFilteredDocuments(response.data || []);
        return response.data;
      } catch (error) {
        handleError(error, "Failed to search documents.");
        throw error;
      }
    },
    [actions, handleError]
  );

  const searchPublicWorkspaces = useCallback(
    async (term) => {
      try {
        const response = await apiService.searchWorkspaces(term);
        actions.setFilteredWorkspaces(response.data || []);
        return response.data;
      } catch (error) {
        handleError(error, "Failed to search workspaces.");
        throw error;
      }
    },
    [actions, handleError]
  );

  const previewDocument = useCallback(
    async (documentId) => {
      try {
        const response = await apiService.previewDocument(documentId);
        return response.data;
      } catch (error) {
        console.error("Error previewing document:", error);
        handleError(error, "Failed to preview document.");
        throw error;
      }
    },
    [handleError]
  );

  // ============ AUTH HELPER FUNCTIONS ============

  const refreshAuthState = useCallback(() => {
    actions.setAuthState({
      hasValidToken: isUserAuthenticated(),
      token: getJwtToken(),
    });
  }, [actions]);

  const getCurrentToken = useCallback(() => {
    return getJwtToken();
  }, []);

  // ============ FILTERED DATA ============

  const filteredDocs = useMemo(() => {
    return Array.isArray(state.documents.list)
      ? state.documents.list.filter((document) =>
          document.name
            ? document.name
                .toLowerCase()
                .includes(state.search.term.toLowerCase())
            : false
        )
      : [];
  }, [state.documents.list, state.search.term]);

  // ============ EFFECTS ============

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfileData();
    } else {
      actions.setProfileData(null);
      actions.setProfileLoading(false);
    }
  }, [isAuthenticated, fetchProfileData, actions]);

  useEffect(() => {
    if (isAuthenticated && user) {
      fetchWorkspacesByUser();
    }
  }, [isAuthenticated, user, fetchWorkspacesByUser]);

  // ============ CONTEXT VALUE ============

  const contextValue = useMemo(
    () => ({
      // State
      ...state,
      filteredDocs,

      // Profile Operations
      fetchProfileData,
      updateProfile,

      // Workspace Operations
      createWorkspace,
      deleteWorkspace,
      fetchWorkspacesByUser,

      // Document Operations
      fetchDocuments,
      uploadDocument,
      deleteDocument,
      downloadDocument,
      restoreDocument,
      updateDocumentMetadata,
      updateDocumentTags,
      getDocumentMetadata,

      // Collaboration Operations
      fetchCollaborators,
      addCollaboratorToWorkspace,

      // Search & Preview Operations
      searchDocuments,
      searchDocumentsWithParams,
      searchPublicWorkspaces,
      previewDocument,

      // Auth Helper Functions
      refreshAuthState,
      getCurrentToken,

      // UI Actions
      setShowPreviewModal: actions.setShowPreviewModal,
      setPreviewFile: actions.setPreviewFile,
      setSelectedWorkspace: actions.setSelectedWorkspace,
      setSelectedRole: actions.setSelectedRole,
    }),
    [
      state,
      filteredDocs,
      fetchProfileData,
      updateProfile,
      createWorkspace,
      deleteWorkspace,
      fetchWorkspacesByUser,
      fetchDocuments,
      uploadDocument,
      deleteDocument,
      downloadDocument,
      restoreDocument,
      updateDocumentMetadata,
      updateDocumentTags,
      getDocumentMetadata,
      fetchCollaborators,
      addCollaboratorToWorkspace,
      searchDocuments,
      searchDocumentsWithParams,
      searchPublicWorkspaces,
      previewDocument,
      refreshAuthState,
      getCurrentToken,
      actions,
    ]
  );

  return (
    <DashboardContext.Provider value={contextValue}>
      {children}
    </DashboardContext.Provider>
  );
};

DashboardProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const useDashboardContext = () => {
  const context = useContext(DashboardContext);

  if (context === undefined) {
    throw new Error(
      "useDashboardContext must be used within a DashboardProvider"
    );
  }

  return context;
};

export default DashboardContext;
