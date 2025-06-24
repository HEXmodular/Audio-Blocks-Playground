import PubSubService from '../../services/PubSubService';

describe('PubSubService', () => {
  it('should be a singleton', () => {
    const instance1 = PubSubService;
    const instance2 = PubSubService;
    expect(instance1).toBe(instance2);
  });

  it('should publish and subscribe to an event', () => {
    const mockCallback = jest.fn();
    const eventName = 'testEvent';
    const eventData = { message: 'Hello, world!' };

    const unsubscribe = PubSubService.subscribe(eventName, mockCallback);

    PubSubService.publish(eventName, eventData);

    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith(eventData);

    unsubscribe();
  });

  it('should unsubscribe from an event', () => {
    const mockCallback = jest.fn();
    const eventName = 'testEventUnsubscribe';

    const unsubscribe = PubSubService.subscribe(eventName, mockCallback);
    unsubscribe();

    PubSubService.publish(eventName, { message: 'This should not be received' });

    expect(mockCallback).not.toHaveBeenCalled();
  });

  it('should handle multiple subscribers for the same event', () => {
    const mockCallback1 = jest.fn();
    const mockCallback2 = jest.fn();
    const eventName = 'multiSubEvent';
    const eventData = { count: 42 };

    const unsubscribe1 = PubSubService.subscribe(eventName, mockCallback1);
    const unsubscribe2 = PubSubService.subscribe(eventName, mockCallback2);

    PubSubService.publish(eventName, eventData);

    expect(mockCallback1).toHaveBeenCalledTimes(1);
    expect(mockCallback1).toHaveBeenCalledWith(eventData);
    expect(mockCallback2).toHaveBeenCalledTimes(1);
    expect(mockCallback2).toHaveBeenCalledWith(eventData);

    unsubscribe1();
    unsubscribe2();
  });

  it('should not call subscriber if unsubscribed, even with multiple subscribers', () => {
    const mockCallback1 = jest.fn();
    const mockCallback2 = jest.fn();
    const eventName = 'multiSubUnsubEvent';
    const eventData = { info: 'test' };

    const unsubscribe1 = PubSubService.subscribe(eventName, mockCallback1);
    const unsubscribe2 = PubSubService.subscribe(eventName, mockCallback2);

    unsubscribe1(); // Unsubscribe the first one

    PubSubService.publish(eventName, eventData);

    expect(mockCallback1).not.toHaveBeenCalled();
    expect(mockCallback2).toHaveBeenCalledTimes(1);
    expect(mockCallback2).toHaveBeenCalledWith(eventData);

    unsubscribe2();
  });

  it('should allow subscribing to different events', () => {
    const mockCallbackEvent1 = jest.fn();
    const mockCallbackEvent2 = jest.fn();
    const eventName1 = 'eventOne';
    const eventName2 = 'eventTwo';
    const eventData1 = { name: 'event 1 data' };
    const eventData2 = { name: 'event 2 data' };

    const unsubscribe1 = PubSubService.subscribe(eventName1, mockCallbackEvent1);
    const unsubscribe2 = PubSubService.subscribe(eventName2, mockCallbackEvent2);

    PubSubService.publish(eventName1, eventData1);
    PubSubService.publish(eventName2, eventData2);

    expect(mockCallbackEvent1).toHaveBeenCalledTimes(1);
    expect(mockCallbackEvent1).toHaveBeenCalledWith(eventData1);
    expect(mockCallbackEvent2).toHaveBeenCalledTimes(1);
    expect(mockCallbackEvent2).toHaveBeenCalledWith(eventData2);

    unsubscribe1();
    unsubscribe2();
  });
});
