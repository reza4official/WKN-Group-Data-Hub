/** Memetakan kode kesalahan Firebase Auth ke pesan Indonesia. Salah username dan salah password sengaja satu pesan. */
export function loginErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'Username atau password salah.'
    case 'auth/user-disabled':
      return 'Akun ini dinonaktifkan. Hubungi atasan Anda.'
    case 'auth/too-many-requests':
      return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.'
    case 'auth/network-request-failed':
      return 'Tidak ada koneksi internet. Periksa jaringan Anda lalu coba lagi.'
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Login Google dibatalkan.'
    case 'auth/popup-blocked':
      return 'Jendela login Google diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.'
    default:
      return 'Tidak dapat masuk. Coba lagi.'
  }
}

export function googleLinkMessage(error: string | undefined, status?: number, detail?: string): string {
  switch (error) {
    case 'not_registered':
      return 'Email Google ini belum terdaftar. Minta atasan Anda membuatkan akun terlebih dahulu.'
    case 'disabled':
      return 'Akun ini dinonaktifkan. Hubungi atasan Anda.'
    case 'email_unverified':
      return 'Email Google belum terverifikasi.'
    case 'ambiguous':
      return 'Email ini terdaftar pada lebih dari satu akun. Hubungi atasan Anda.'
    default: {
      // Kode kesalahan ditampilkan agar mudah dilaporkan dan ditelusuri di log Worker.
      const code = error ?? (status ? `HTTP ${status}` : 'tidak diketahui')
      return `Login Google gagal (kode: ${code}${detail ? ` - ${detail}` : ''}). Coba lagi.`
    }
  }
}
