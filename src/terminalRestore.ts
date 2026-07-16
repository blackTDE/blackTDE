export interface TerminalRestoreActions {
  lookupActive: () => Promise<boolean>;
  reset: () => void;
  replayHistory?: () => Promise<void>;
  resume: (rows?: number, cols?: number) => Promise<void>;
  fitAndResize: (resize?: boolean) => Promise<void>;
  setReady: () => void;
  onLookupError: (error: unknown) => void;
}

export const restoreTerminal = async (actions: TerminalRestoreActions): Promise<void> => {
  let isActive: boolean;

  try {
    isActive = await actions.lookupActive();
  } catch (error) {
    actions.onLookupError(error);
    await actions.fitAndResize();
    actions.setReady();
    return;
  }

  if (!isActive) {
    actions.reset();
    await actions.fitAndResize(false);
    await actions.replayHistory?.();
    await actions.resume();
  }

  await actions.fitAndResize();
  actions.setReady();
};
