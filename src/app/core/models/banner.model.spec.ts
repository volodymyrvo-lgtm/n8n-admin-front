import { bannerStatusView, formatFileSize } from './banner.model';

describe('banner model', () => {
  it('gives every known status a label key and a badge colour', () => {
    expect(bannerStatusView('pending')).toEqual({ labelKey: 'banners.status.pending', raw: 'pending', badgeClass: 'status-badge--paused' });
    expect(bannerStatusView('approved').badgeClass).toBe('status-badge--active');
    expect(bannerStatusView('rejected').badgeClass).toBe('status-badge--failed');
    expect(bannerStatusView('sending').badgeClass).toBe('status-badge--admin');
    expect(bannerStatusView('sent').badgeClass).toBe('status-badge--active');
    expect(bannerStatusView('send_failed').labelKey).toBe('banners.status.send_failed');
  });

  it('shows an unknown status as its raw value on a neutral badge', () => {
    expect(bannerStatusView('archived')).toEqual({ labelKey: null, raw: 'archived', badgeClass: 'status-badge--neutral' });
  });

  it('formats file sizes in B, KB and MB', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(706899)).toBe('690 KB');
    expect(formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(formatFileSize(-1)).toBe('—');
    expect(formatFileSize(NaN)).toBe('—');
  });
});
