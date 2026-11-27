/* Bug hunt L1-45 (2026-11-27, Seeker B, emulator): a send stopped after its
   order row was saved (the network cut after "Making your cover"). The form
   opened again; the customer changed Softcover → Hardbound, Matte → Glossy,
   5 → 10 years and tapped Place order online. The app reused the saved order
   (softcover, matte, 5 years, quoted ₱1,605) but drew the files and asked for
   the money from the changed form ("Send ₱2,164"). Now Place order finishes
   the saved order from what it froze (the Finish sending path, which takes the
   cover, paper, years and total from the order row), and the form says so.
   "Place a new order instead" really places a new one. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { NEW_ORDER_INSTEAD, retryFinishesSavedOrder, SAVED_ORDER_LOAD_FAILED, savedOrderNote } from '../src/lib/checkout/unsentOrders';

const placed = { id: 'order-1' };

describe('Place order again after a send that stopped once the order was saved', () => {
  it('finishes the saved order, for a real order of your own album', () => {
    expect(retryFinishesSavedOrder({ live: true, placed, finishingTestOrder: false, eventAlbum: false })).toBe(true);
  });

  it('a first Place order (no saved order yet) builds the order from the form, as before', () => {
    expect(retryFinishesSavedOrder({ live: true, placed: null, finishingTestOrder: false, eventAlbum: false })).toBe(false);
  });

  it('the test album, a free tester order being finished by its code, and event albums keep their own paths', () => {
    expect(retryFinishesSavedOrder({ live: false, placed, finishingTestOrder: false, eventAlbum: false })).toBe(false);
    expect(retryFinishesSavedOrder({ live: true, placed, finishingTestOrder: true, eventAlbum: false })).toBe(false);
    expect(retryFinishesSavedOrder({ live: true, placed, finishingTestOrder: false, eventAlbum: true })).toBe(false);
  });

  it('the form says it plainly, with the way to a new order', () => {
    expect(savedOrderNote('MP-2026-X37GQAB')).toBe(
      'Your order MP-2026-X37GQAB is saved. Place order finishes sending it as you placed it. Changes on this page don\'t change it. To change it, tap "Place a new order instead".');
    expect(NEW_ORDER_INSTEAD).toBe('Place a new order instead');
    expect(SAVED_ORDER_LOAD_FAILED).toBe("We couldn't get your saved order from your account. Check your internet, then tap Place order again.");
  });

  it('the checkout screen: Place order goes to Finish sending for the saved order; "new instead" forgets it', () => {
    const src = readFileSync(path.join(__dirname, '../src/app/order.tsx'), 'utf8').replace(/\r\n/g, '\n');
    // Checked before any plan is built from the form.
    // A free tester order (its code on the last try's row) keeps its own path (Mother, L1-45).
    expect(src).toContain('const savedIsTestOrder = !!plan?.orderRow?.tester_code;');
    const check = src.indexOf('if (retryFinishesSavedOrder({ live, placed: placedRef.current, finishingTestOrder: finishing || savedIsTestOrder, eventAlbum: !!eventLink })) {\n      void startFinishing(placedRef.current!.id);\n      return;\n    }');
    const formPlan = src.indexOf('const p = placeOrderPlan({');
    expect(check).toBeGreaterThan(0);
    expect(check).toBeLessThan(formPlan);
    // Finish sending reads the order row and takes its cover, paper and total.
    expect(src).toContain('const order = await loadFinishOrder(supabase as never, userId, orderId);');
    expect(src).toContain('setPlacedAmount(askedToPay(order) ?? price.payTotal);');
    expect(src).toContain("cover={fo?.cover ? fo.cover as CoverType : cover} material={fo?.material ? fo.material as MaterialType : material}");
    // Both "Place a new order instead" buttons forget the saved order.
    // ...and the id kept for it (L1-47), so the new order gets its own.
    expect(src.match(/placedRef\.current = null; orderIdRef\.current = null; setNewInstead\(true\)/g)).toHaveLength(2);
    expect(src).toContain('testID="order-saved-note"');
  });
});
