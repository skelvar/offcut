export function useBusyState(initial = false) {
  let busy = Boolean(initial);
  return {
    get busy() {
      return busy;
    },
    start() {
      busy = true;
    },
    stop() {
      busy = false;
    },
  };
}
