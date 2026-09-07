declare global {
  // Used to pass teardown messages from global-setup to global-teardown via globalThis.
   
  var __TEARDOWN_MESSAGE__: string;
}

export {};
