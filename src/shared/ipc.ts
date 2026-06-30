// Central registry of IPC channel names shared between main & preload.
// Using a const object keeps channel strings in one place and typo-proof.

export const Channels = {
  // dialogs / app
  selectDirectory: 'app:selectDirectory',
  getRecentRepos: 'app:getRecentRepos',
  addRecentRepo: 'app:addRecentRepo',
  removeRecentRepo: 'app:removeRecentRepo',
  openExternal: 'app:openExternal',
  getSession: 'app:getSession',
  setSession: 'app:setSession',

  // repo lifecycle
  openRepo: 'git:openRepo',
  cloneRepo: 'git:cloneRepo',
  initRepo: 'git:initRepo',

  // reads
  getCommits: 'git:getCommits',
  getStatus: 'git:getStatus',
  getBranches: 'git:getBranches',
  getRemotes: 'git:getRemotes',
  getStashes: 'git:getStashes',
  getTags: 'git:getTags',
  getCommitDiff: 'git:getCommitDiff',
  getWorkingDiff: 'git:getWorkingDiff',

  // writes / actions
  stage: 'git:stage',
  unstage: 'git:unstage',
  discard: 'git:discard',
  stageAll: 'git:stageAll',
  unstageAll: 'git:unstageAll',
  commit: 'git:commit',
  push: 'git:push',
  pull: 'git:pull',
  fetch: 'git:fetch',

  checkoutBranch: 'git:checkoutBranch',
  createBranch: 'git:createBranch',
  deleteBranch: 'git:deleteBranch',
  mergeBranch: 'git:mergeBranch',

  checkoutCommit: 'git:checkoutCommit',
  resetTo: 'git:resetTo',
  revertCommit: 'git:revertCommit',
  cherryPick: 'git:cherryPick',
  createTag: 'git:createTag',

  stashSave: 'git:stashSave',
  stashApply: 'git:stashApply',
  stashPop: 'git:stashPop',
  stashDrop: 'git:stashDrop',
  stashRename: 'git:stashRename',

  addRemote: 'git:addRemote',
  removeRemote: 'git:removeRemote',

  // config
  getUserConfig: 'git:getUserConfig',
  setUserConfig: 'git:setUserConfig',

  // ssh
  listSshKeys: 'ssh:list',
  generateSshKey: 'ssh:generate',
  deleteSshKey: 'ssh:delete'
} as const

export type ChannelName = (typeof Channels)[keyof typeof Channels]
