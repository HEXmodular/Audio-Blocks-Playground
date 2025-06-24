class PubSubService {
  private static instance: PubSubService;

  private constructor() {
    // Private constructor to prevent direct instantiation
  }

  public static getInstance(): PubSubService {
    if (!PubSubService.instance) {
      PubSubService.instance = new PubSubService();
    }
    return PubSubService.instance;
  }

  public publish<T>(eventName: string, data?: T): void {
    const event = new CustomEvent(eventName, { detail: data });
    window.dispatchEvent(event);
  }

  public subscribe<T>(eventName: string, callback: (data: T) => void): () => void {
    const eventListener = (event: CustomEvent<T>) => {
      callback(event.detail);
    };
    window.addEventListener(eventName as any, eventListener);
    return () => {
      window.removeEventListener(eventName as any, eventListener);
    };
  }
}

export default PubSubService.getInstance();
