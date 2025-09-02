'use client'

import React, { useState } from 'react'
import { db } from '@/lib/firebase'
import { doc, setDoc } from 'firebase/firestore'
import { useRouter } from 'next/navigation'

const SignupPage = () => {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('user')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')

    if (!name || !email || !phone || !password) {
      setErrorMessage('Please fill all fields.')
      return
    }

    try {
      setIsSubmitting(true)
      const id = `user_${Date.now()}`
      const payload = {
        name,
        email,
        phone,
        password,
        role,
        ...(role === 'user' ? { favoriteRoutes: [] } : {})
      }

      await setDoc(doc(db, 'users', id), payload)
      setSuccessMessage('Signup successful!')
      setName('')
      setEmail('')
      setPhone('')
      setPassword('')
      setRole('user')
      router.push('/login')
    } catch (error) {
      setErrorMessage('Failed to save. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: '540px', margin: '40px auto', padding: '24px', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '16px' }}>Signup</h1>

      {errorMessage && (
        <div style={{ marginBottom: '12px', color: '#b91c1c' }}>{errorMessage}</div>
      )}
      {successMessage && (
        <div style={{ marginBottom: '12px', color: '#065f46' }}>{successMessage}</div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label htmlFor="name" style={{ fontSize: '14px' }}>Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          />

          <label htmlFor="email" style={{ fontSize: '14px' }}>Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          />

          <label htmlFor="phone" style={{ fontSize: '14px' }}>Phone</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="1234567890"
            required
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          />

          <label htmlFor="password" style={{ fontSize: '14px' }}>Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Create a password"
            required
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          />

          <label htmlFor="role" style={{ fontSize: '14px' }}>Role</label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>

          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              marginTop: '16px',
              padding: '10px 12px',
              backgroundColor: isSubmitting ? '#9ca3af' : '#111827',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: isSubmitting ? 'not-allowed' : 'pointer'
            }}
          >
            {isSubmitting ? 'Submitting…' : 'Create Account'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default SignupPage


