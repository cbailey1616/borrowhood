import { exchangeDetailRows } from '../../src/utils/exchangeDetails';

it('includes actual giveaway history even without price or request notes', () => {
  const details = Object.fromEntries(exchangeDetailRows({
    status: 'completed', listingType: 'giveaway',
    createdAt: '2026-09-10T12:00:00Z', actualPickupAt: '2026-09-12T14:30:00Z',
    startDate: '2026-09-10T12:00:00Z', endDate: '2026-09-10T12:00:00Z',
  }));
  expect(details).toEqual({ Status: 'Completed', Requested: expect.stringContaining('2026'), 'Picked up': expect.stringContaining('2026'), Price: 'Free to keep' });
  expect(details.Requested).not.toBe(details['Picked up']);
});

it('never invents dates or a free price for missing data', () => {
  expect(Object.fromEntries(exchangeDetailRows({status:'completed',createdAt:null,actualPickupAt:'bad date',actualReturnAt:''})))
    .toEqual({Status:'Completed'});
});

it('shows recorded return dates and conditions for borrowing', () => {
  expect(Object.fromEntries(exchangeDetailRows({
    status:'returned',dailyRate:2.5,actualReturnAt:'2026-09-12T14:30:00Z',conditionAtPickup:'like_new',conditionAtReturn:'good',
  }))).toEqual({Status:'Returned',Returned:expect.stringContaining('2026'),Price:'$2.50/day','Condition at pickup':'Like New','Condition at return':'Good'});
});

it.each([['day','$25.00/day'],['hour','$25.00/hour'],['flat','$25.00 flat fee']])('preserves the %s borrowing price', (unit, price) => {
  expect(Object.fromEntries(exchangeDetailRows({listingType:'lend',directFee:{amount:25,unit},dailyRate:0})).Price).toBe(price);
});

it('keeps giveaway prices free and sale prices distinct from borrowing', () => {
  const fee={amount:60,unit:'flat'};
  expect(Object.fromEntries(exchangeDetailRows({listingType:'giveaway',directFee:fee})).Price).toBe('Free to keep');
  expect(Object.fromEntries(exchangeDetailRows({listingType:'sell',directFee:fee})).Price).toBe('$60.00');
  expect(Object.fromEntries(exchangeDetailRows({listingType:'sell',directFee:{amount:'bad'}})).Price).toBe('Ask for price');
  expect(Object.fromEntries(exchangeDetailRows({listingType:'lend',dailyRate:0})).Price).toBe('Free to borrow');
});

it('does not describe a picked-up transfer as currently borrowed', () => {
  expect(Object.fromEntries(exchangeDetailRows({listingType:'giveaway',status:'picked_up'})).Status).toBe('Completed');
  expect(Object.fromEntries(exchangeDetailRows({listingType:'lend',status:'returned',paymentStatus:'authorized'})).Status).toBe('Awaiting return confirmation');
});
