// src/reducers/actionTypes.js

/**
 * ACTION_TYPES
 * --------------------------------------------------------------------
 * All global Redux-style constants that define what kind of action
 * is being dispatched to the reducer.
 * Each corresponds to a specific state update handled by dashboardReducer.
 * --------------------------------------------------------------------
 */

export const ACTION_TYPES = {
  // ==================== PROFILE ====================
  SET_PROFILE_LOADING: "SET_PROFILE_LOADING",
  SET_PROFILE_DATA: "SET_PROFILE_DATA",
  SET_PROFILE_ERROR: "SET_PROFILE_ERROR",

  // ==================== WORKSPACES ====================
  SET_WORKSPACES_LOADING: "SET_WORKSPACES_LOADING",
  SET_WORKSPACES_DATA: "SET_WORKSPACES_DATA",
  ADD_WORKSPACE: "ADD_WORKSPACE",
  REMOVE_WORKSPACE: "REMOVE_WORKSPACE",
  UPDATE_WORKSPACE: "UPDATE_WORKSPACE",

  // ==================== DOCUMENTS ====================
  SET_DOCUMENTS_LOADING: "SET_DOCUMENTS_LOADING",
  SET_DOCUMENTS_DATA: "SET_DOCUMENTS_DATA",
  ADD_DOCUMENT: "ADD_DOCUMENT",
  REMOVE_DOCUMENT: "REMOVE_DOCUMENT",
  UPDATE_DOCUMENT: "UPDATE_DOCUMENT",

  // ==================== RECYCLE BIN ====================
  SET_RECYCLE_BIN_DATA: "SET_RECYCLE_BIN_DATA",
  REMOVE_FROM_RECYCLE_BIN: "REMOVE_FROM_RECYCLE_BIN",

  // ==================== DELETED USERS ====================
  SET_DELETED_USERS_DATA: "SET_DELETED_USERS_DATA",
  REMOVE_DELETED_USER: "REMOVE_DELETED_USER",

  // ==================== COLLABORATORS ====================
  SET_COLLABORATORS_LOADING: "SET_COLLABORATORS_LOADING",
  SET_COLLABORATORS_DATA: "SET_COLLABORATORS_DATA",
  SET_COLLABORATORS_ERROR: "SET_COLLABORATORS_ERROR",

  // ==================== SEARCH ====================
  SET_SEARCH_TERM: "SET_SEARCH_TERM",
  SET_FILTERED_DOCUMENTS: "SET_FILTERED_DOCUMENTS",
  SET_FILTERED_WORKSPACES: "SET_FILTERED_WORKSPACES",

  // ==================== UI STATE ====================
  SET_PREVIEW_FILE: "SET_PREVIEW_FILE",
  SET_SHOW_PREVIEW_MODAL: "SET_SHOW_PREVIEW_MODAL",
  SET_SELECTED_WORKSPACE: "SET_SELECTED_WORKSPACE",
  SET_SELECTED_ROLE: "SET_SELECTED_ROLE",

  // ==================== LOADING STATES ====================
  SET_LOADING_STATE: "SET_LOADING_STATE",

  // ==================== AUTH (OPTIONAL) ====================
  SET_AUTH_STATE: "SET_AUTH_STATE",
};
