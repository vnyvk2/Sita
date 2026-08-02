export enum ShutdownState {
  Idle = 'Idle',
  Started = 'Started',
  StoppingSchedulers = 'StoppingSchedulers',
  SavingState = 'SavingState',
  ClosingDatabase = 'ClosingDatabase',
  DatabaseClosed = 'DatabaseClosed',
  FinishedSuccess = 'Finished (Success)',
  FinishedFailed = 'Finished (Failed)'
}
