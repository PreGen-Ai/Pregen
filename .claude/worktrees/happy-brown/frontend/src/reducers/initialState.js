// src/reducers/initialState.js

/**
 * initialState
 * -------------------------------------------------------
 * Defines the default global state structure for the dashboard.
 * This is used by the DashboardProvider + dashboardReducer.
 * -------------------------------------------------------
 */

export const initialState = {
  // ==================== PROFILE ====================
  profile: {
    data: null, // Holds user data (name, email, role, etc.)
    loading: true, // Loading flag during fetch/update
    error: null, // Error messages (if any)
  },

  // ==================== WORKSPACES / CLASSES ====================
  workspaces: {
    list: [], // Array of user's workspaces or classes
    loading: true, // True when fetching or modifying workspaces
    error: null, // Error message if API fails
  },

  // ==================== DOCUMENTS ====================
  documents: {
    list: [], // List of uploaded or fetched documents
    loading: false, // True when uploading/downloading/fetching
    error: null, // Error message if any operation fails
  },

  // ==================== RECYCLE BIN (Deleted Documents) ====================
  recycleBin: {
    list: [], // Documents marked as deleted (soft-deleted)
    loading: false, // True while fetching recycle bin
    error: null, // Any recycle bin error
  },

  // ==================== DELETED USERS (ADMIN-ONLY) ====================
  deletedUsers: {
    list: [], // Array of deleted users (for admin restore/delete)
    loading: false, // True when fetching deleted users
    error: null, // Error if request fails
  },

  // ==================== COLLABORATORS (Students / Teachers) ====================
  collaborators: {
    list: [], // Users with access to a workspace
    loading: false, // True while fetching collaborators
    error: null, // Error state for collaborator ops
  },

  // ==================== SEARCH STATE ====================
  search: {
    term: "", // Search query term
    filteredDocuments: [], // Search results for documents
    filteredWorkspaces: [], // Search results for workspaces/classes
  },

  // ==================== UI STATE ====================
  ui: {
    previewFile: null, // File being previewed
    showPreviewModal: false, // Boolean for preview modal visibility
    selectedWorkspace: null, // Currently active workspace/class
    selectedRole: "Viewer", // Default user role (Viewer/Editor/Admin)

    // Additional UI controls
    modals: {
      createWorkspace: false,
      inviteCollaborator: false,
      documentPreview: false,
    },
    sidebar: {
      collapsed: false, // Sidebar collapse toggle
    },
  },

  // ==================== LOADING FLAGS ====================
  loadingStates: {
    profile: false,
    workspaces: false,
    documents: false,
    upload: false,
    collaborators: false,
  },

  // ==================== AUTH STATE ====================
  auth: {
    hasValidToken: false, // True if JWT token is valid
    token: null, // Current JWT token
  },
};
