import { TestBed } from '@angular/core/testing';
import { Calendar } from './calendar';

describe('Calendar', () => {
  beforeEach(() => localStorage.clear());

  function render(period: 'daily' | 'weekly' | 'monthly', available: string[], selected: string) {
    const fixture = TestBed.createComponent(Calendar);
    fixture.componentRef.setInput('period', period);
    fixture.componentRef.setInput('available', available);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    return fixture;
  }

  it('lights up the whole chosen week and greys out the weeks without summary', () => {
    const fixture = render('weekly', ['2026-10-26', '2026-11-02'], '2026-11-02');
    const compiled = fixture.nativeElement as HTMLElement;
    const selected = compiled.querySelector('.week.selected')!;
    expect(
      Array.from(selected.querySelectorAll('.cell')).map((c) => c.textContent?.trim()),
    ).toEqual(['2', '3', '4', '5', '6', '7', '8']);
    // The row of October 26 – November 1 can be picked, the one of November 9 cannot.
    const rows = Array.from(compiled.querySelectorAll('.week'));
    expect((rows[0].querySelector('.cell') as HTMLButtonElement).disabled).toBe(false);
    expect((rows[2].querySelector('.cell') as HTMLButtonElement).disabled).toBe(true);
  });

  it('emits the 1st of the month picked, and only moves to years with a summary', () => {
    const fixture = render('monthly', ['2026-09-01', '2026-10-01'], '2026-10-01');
    const compiled = fixture.nativeElement as HTMLElement;
    const picked: string[] = [];
    fixture.componentInstance.picked.subscribe((value) => picked.push(value));

    const months = Array.from(compiled.querySelectorAll<HTMLButtonElement>('.months .cell'));
    expect(months.filter((m) => !m.disabled).length).toBe(2);
    months[8].click(); // September
    expect(picked).toEqual(['2026-09-01']);
    const [back, forward] = Array.from(compiled.querySelectorAll<HTMLButtonElement>('.arrow'));
    expect(back.disabled).toBe(true);
    expect(forward.disabled).toBe(true);
  });
});
