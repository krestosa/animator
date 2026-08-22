import { Router } from 'express';
import { auxiliaryRuntimeSource } from '../aux-runtime.js';
import { browserSnapshotRuntimeSource } from '../browser-snapshot-runtime.js';
import { clockWorkerSource } from '../clock-worker.js';
import { mutationRuntimeSource } from '../mutation-runtime.js';
import { recordResumeRuntimeSource } from '../record-resume-runtime.js';
import { runtimeSource } from '../runtime.js';
import { seekRuntimeSource } from '../seek-runtime.js';

export function createRuntimeRouter():Router{
  const router=Router();
  router.get('/runtime.js',(_req,res)=>res.type('application/javascript').send(runtimeSource));
  router.get('/aux-runtime.js',(_req,res)=>res.type('application/javascript').send(auxiliaryRuntimeSource));
  router.get('/seek-runtime.js',(_req,res)=>res.type('application/javascript').send(seekRuntimeSource));
  router.get('/mutation-runtime.js',(_req,res)=>res.type('application/javascript').send(mutationRuntimeSource));
  router.get('/record-resume-runtime.js',(_req,res)=>res.type('application/javascript').send(recordResumeRuntimeSource));
  router.get('/browser-snapshot-runtime.js',(_req,res)=>res.type('application/javascript').send(browserSnapshotRuntimeSource));
  router.get('/clock-worker.js',(_req,res)=>res.type('application/javascript').send(clockWorkerSource));
  return router;
}
