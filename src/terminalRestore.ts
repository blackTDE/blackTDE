export interface TerminalRestoreActions {
  lookupActive: () => Promise<boolean>;
  replayHistory: () => Promise<void>;
  reset: () => void;
  resume: () => Promise<void>;
  fitAndResize: () => Promise<void>;
  setReady: () => void;
  redraw: () => Promise<void>;
  onLookupError: (error: unknown) => void;
}

export const restoreTerminal = async (actions: TerminalRestoreActions): Promise<void> => {
  let isActive: boolean;

  try {
    isActive = await actions.lookupActive();
  } catch (error) {
    actions.onLookupError(error);
    await actions.replayHistory();
    actions.setReady();
    return;
  }

  if (!isActive) {
    actions.reset();
    await actions.resume();
  }

  await actions.fitAndResize();
  actions.setReady();
  await actions.redraw();
};
