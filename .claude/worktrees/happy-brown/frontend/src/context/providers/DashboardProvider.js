// src/context/providers/DashboardProvider.js
import React, { createContext, useContext, useReducer, useMemo } from "react";
import { dashboardReducer } from "../../reducers/dashboardReducer";
import { initialState } from "../../reducers/initialState";
import { ACTION_TYPES } from "../../reducers/actionTypes";

/**
 * DataContext
 * Provides global data + state management for:
 * - Profile
 * - Workspaces
 * - Documents
 * - Deleted Users
 * - Collaborators
 * - Loading states
 */
const DataContext = createContext();

/**
 * Custom Hook: useDataReducer
 * Gives child contexts access to shared state + actions
 */
export const useDataReducer = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useDataReducer must be used within a DashboardProvider");
  }
  return context;
};

/**
 * DashboardProvider
 * Global provider handling shared reducer logic and action dispatching.
 * Other contexts (Profile, Workspace, Document, etc.) use this provider.
 */
export const DashboardProvider = ({ children }) => {
  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  // ==================== ACTION CREATORS ====================
  const actions = useMemo(
    () => ({
      // -------- Profile --------
      setProfileLoading: (loading) =>
        dispatch({
          type: ACTION_TYPES.SET_PROFILE_LOADING,
          payload: loading,
        }),

      setProfileData: (data) =>
        dispatch({
          type: ACTION_TYPES.SET_PROFILE_DATA,
          payload: data,
        }),

      setProfileError: (error) =>
        dispatch({
          type: ACTION_TYPES.SET_PROFILE_ERROR,
          payload: error,
        }),

      // -------- Workspaces --------
      setWorkspacesLoading: (loading) =>
        dispatch({
          type: ACTION_TYPES.SET_WORKSPACES_LOADING,
          payload: loading,
        }),

      setWorkspacesData: (data) =>
        dispatch({
          type: ACTION_TYPES.SET_WORKSPACES_DATA,
          payload: data,
        }),

      addWorkspace: (workspace) =>
        dispatch({
          type: ACTION_TYPES.ADD_WORKSPACE,
          payload: workspace,
        }),

      removeWorkspace: (workspaceId) =>
        dispatch({
          type: ACTION_TYPES.REMOVE_WORKSPACE,
          payload: workspaceId,
        }),

      // -------- Documents --------
      setDocumentsData: (data) =>
        dispatch({
          type: ACTION_TYPES.SET_DOCUMENTS_DATA,
          payload: data,
        }),

      addDocument: (document) =>
        dispatch({
          type: ACTION_TYPES.ADD_DOCUMENT,
          payload: document,
        }),

      removeDocument: (documentId) =>
        dispatch({
          type: ACTION_TYPES.REMOVE_DOCUMENT,
          payload: documentId,
        }),

      updateDocument: (documentId, updatedDocument) =>
        dispatch({
          type: ACTION_TYPES.UPDATE_DOCUMENT,
          payload: { documentId, updatedDocument },
        }),

      // -------- Recycle Bin --------
      setRecycleBinData: (data) =>
        dispatch({
          type: ACTION_TYPES.SET_RECYCLE_BIN_DATA,
          payload: data,
        }),

      removeFromRecycleBin: (documentId) =>
        dispatch({
          type: ACTION_TYPES.REMOVE_FROM_RECYCLE_BIN,
          payload: documentId,
        }),

      // -------- Deleted Users --------
      setDeletedUsersData: (data) =>
        dispatch({
          type: ACTION_TYPES.SET_DELETED_USERS_DATA,
          payload: data,
        }),

      removeDeletedUser: (userId) =>
        dispatch({
          type: ACTION_TYPES.REMOVE_DELETED_USER,
          payload: userId,
        }),

      // -------- Collaborators --------
      setCollaboratorsData: (data) =>
        dispatch({
          type: ACTION_TYPES.SET_COLLABORATORS_DATA,
          payload: data,
        }),

      // -------- Loading States --------
      setLoadingState: (key, isLoading) =>
        dispatch({
          type: ACTION_TYPES.SET_LOADING_STATE,
          payload: { key, isLoading },
        }),
    }),
    []
  );

  // ==================== CONTEXT VALUE ====================
  const dataContextValue = useMemo(
    () => ({
      state,
      actions,
    }),
    [state, actions]
  );

  return (
    <DataContext.Provider value={dataContextValue}>
      {children}
    </DataContext.Provider>
  );
};

export default DashboardProvider;
