import appPhotosManager from '../lib/appManagers/appPhotosManager';
import CryptoWorker from '../lib/crypto/cryptoworker';
import LottieLoader from '../lib/lottieLoader';
import appStickersManager from "../lib/appManagers/appStickersManager";
import appDocsManager from "../lib/appManagers/appDocsManager";
import {AppImManager} from "../lib/appManagers/appImManager";
import { formatBytes } from "../lib/utils";
import ProgressivePreloader from './preloader';
import LazyLoadQueue from './lazyLoadQueue';
import apiFileManager, { CancellablePromise } from '../lib/mtproto/apiFileManager';
import appWebpManager from '../lib/appManagers/appWebpManager';
import {wrapPlayer} from '../lib/ckin';

export type MTDocument = {
  _: 'document',
  pFlags: any,
  flags: number,
  id: string,
  access_hash: string,
  file_reference: Uint8Array | number[],
  date: number,
  mime_type: string,
  size: number,
  thumbs: MTPhotoSize[],
  dc_id: number,
  attributes: any[],
  
  type?: string,
  h?: number,
  w?: number,
  file_name?: string,
  file?: File
};

export type MTPhotoSize = {
  _: string,
  w?: number,
  h?: number,
  size?: number,
  type?: string, // i, m, x, y, w by asc
  location?: any,
  bytes?: Uint8Array, // if type == 'i'
  
  preloaded?: boolean // custom added
};

export function wrapVideo(this: any, doc: MTDocument, container: HTMLDivElement, message: any, justLoader = true, preloader?: ProgressivePreloader, controls = true, round = false) {
  if(!container.firstElementChild || container.firstElementChild.tagName != 'IMG') {
    let size = appPhotosManager.setAttachmentSize(doc, container);
  }
  
  let peerID = this.peerID ? this.peerID : this.currentMessageID;
  
  //container.classList.add('video');
  
  let img = container.firstElementChild as HTMLImageElement || new Image();
  img.setAttribute('message-id', '' + message.mid);
  
  if(!container.contains(img)) {
    container.append(img);
  }
  
  //return Promise.resolve();
  
  if(!preloader) {
    preloader = new ProgressivePreloader(container, true);
  }
  
  let loadVideo = () => {
    let promise = appDocsManager.downloadDoc(doc);
    
    preloader.attach(container, true, promise);
    
    return promise.then(blob => {
      if((this.peerID ? this.peerID : this.currentMessageID) != peerID) {
        this.log.warn('peer changed');
        return;
      }
      
      console.log('loaded doc:', doc, blob, container);
      
      let video = document.createElement('video');
      /* video.loop = controls;
      video.autoplay = controls;
      
      if(!justLoader) {
        video.controls = controls;
      } else {
        video.volume = 0;
      } */
      
      video.setAttribute('message-id', '' + message.mid);
      
      let source = document.createElement('source');
      //source.src = doc.url;
      source.src = URL.createObjectURL(blob);
      source.type = doc.mime_type;
      
      if(img && container.contains(img)) {
        container.removeChild(img);
      }
      
      video.append(source);
      
      container.append(video);
      
      if(!justLoader || round) {
        video.dataset.ckin = round ? 'circle' : 'default';
        video.dataset.overlay = '1';
        let wrapper = wrapPlayer(video);
        
        if(!round) {
          (wrapper.querySelector('.toggle') as HTMLButtonElement).click();
        }
      } else if(doc.type == 'gif') {
        video.autoplay = true;
        video.loop = true;
      }
      
      //container.style.width = '';
      //container.style.height = '';
    });
  };
  
  if(doc.type == 'gif' || true) { // extra fix
    return this.peerID ? this.loadMediaQueuePush(loadVideo) : loadVideo();
  } else { // if video
    let load = () => appPhotosManager.preloadPhoto(doc).then((blob) => {
      if((this.peerID ? this.peerID : this.currentMessageID) != peerID) {
        this.log.warn('peer changed');
        return;
      }
      
      img.src = URL.createObjectURL(blob);
      
      /* image.style.height = doc.h + 'px';
      image.style.width = doc.w + 'px'; */
      
      /* if(justLoader) { // extra fix
        justLoader = false;
        controls = false;
      } */
      
      if(!justLoader) {
        return loadVideo();
      } else {
        container.style.width = '';
        container.style.height = '';
        preloader.detach();
      }
    });
    
    return this.peerID ? this.loadMediaQueuePush(load) : load();
  }
}

export function wrapDocument(doc: MTDocument, withTime = false): HTMLDivElement {
  let docDiv = document.createElement('div');
  docDiv.classList.add('document');
  
  let iconDiv = document.createElement('div');
  iconDiv.classList.add('tgico-document');
  
  let extSplitted = doc.file_name ? doc.file_name.split('.') : '';
  let ext = '';
  ext = extSplitted.length > 1 && Array.isArray(extSplitted) ? extSplitted.pop().toLowerCase() : 'file';
  
  let ext2 = ext;
  if(doc.type == 'photo') {
    docDiv.classList.add('photo');
    ext2 = `<img src="${URL.createObjectURL(doc.file)}">`;
  }
  
  let fileName = doc.file_name || 'Unknown.file';
  let size = formatBytes(doc.size);
  
  if(withTime) {
    let months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let date = new Date(doc.date * 1000);
    
    size += ' · ' + months[date.getMonth()] + ' ' + date.getDate() + ', ' + date.getFullYear() 
    + ' at ' + date.getHours() + ':' + ('0' + date.getMinutes()).slice(-2);
  }
  
  docDiv.innerHTML = `
  <div class="document-ico ext-${ext}">${ext2}</div>
  <div class="document-download"><div class="tgico-download"></div></div>
  <div class="document-name">${fileName}</div>
  <div class="document-size">${size}</div>
  `;
  
  let downloadDiv = docDiv.querySelector('.document-download') as HTMLDivElement;
  let preloader: ProgressivePreloader;
  let promise: CancellablePromise<Blob>;
  
  docDiv.addEventListener('click', () => {
    if(!promise) {
      if(downloadDiv.classList.contains('downloading')) {
        return; // means not ready yet
      }
      
      if(!preloader) {
        preloader = new ProgressivePreloader(null, true);
      }
      
      appDocsManager.saveDocFile(doc.id).then(res => {
        promise = res.promise;

        preloader.attach(downloadDiv, true, promise);

        promise.then(() => {
          downloadDiv.classList.remove('downloading');
          downloadDiv.remove();
        });
      })

      downloadDiv.classList.add('downloading');
    } else {
      downloadDiv.classList.remove('downloading');
      promise = null;
    }
  });
  
  return docDiv;
}

export function wrapPhoto(this: AppImManager, photo: any, message: any, container: HTMLDivElement) {
  //container.classList.add('photo');
  
  let peerID = this.peerID;
  
  let size = appPhotosManager.setAttachmentSize(photo.id, container);
  let image = container.firstElementChild as HTMLImageElement || new Image();
  //let size = appPhotosManager.setAttachmentSize(photo.id, image);
  image.setAttribute('message-id', message.mid);
  
  if(!container.contains(image)) {
    container.append(image);
  }
  
  let preloader = new ProgressivePreloader(container, false);
  
  let load = () => {
    let promise = appPhotosManager.preloadPhoto(photo.id, size);

    preloader.attach(container, true, promise);

    return promise.then((blob) => {
      if(this.peerID != peerID) {
        this.log.warn('peer changed');
        return;
      }
      
      image.src = URL.createObjectURL(blob);
      
      //image.style.width = '';
      //image.style.height = '';
      //container.style.width = '';
      //container.style.height = '';
    });
  };
  
  console.log('wrapPhoto', load, container, image);
  
  return this.loadMediaQueue ? this.loadMediaQueuePush(load) : load();
}

export function wrapSticker(doc: MTDocument, div: HTMLDivElement, middleware?: () => boolean, lazyLoadQueue?: LazyLoadQueue, group?: string, canvas?: boolean, play = false) {
  let stickerType = doc.mime_type == "application/x-tgsticker" ? 2 : (doc.mime_type == "image/webp" ? 1 : 0);
  
  if(!stickerType) {
    console.error('wrong doc for wrapSticker!', doc, div);
  }
  
  console.log('wrap sticker', doc);
  
  if(doc.thumbs && !div.firstElementChild) {
    let thumb = doc.thumbs[0];
    
    if(thumb.bytes) {
      apiFileManager.saveSmallFile(thumb.location, thumb.bytes);
      
      appPhotosManager.setAttachmentPreview(thumb.bytes, div, true);
    }
  }
  
  let load = () => apiFileManager.downloadSmallFile({
    _: 'inputDocumentFileLocation',
    access_hash: doc.access_hash,
    file_reference: doc.file_reference,
    thumb_size: ''/* document.thumbs[0].type */,
    id: doc.id,
    stickerType: stickerType
  }, {mimeType: doc.mime_type, dcID: doc.dc_id}).then(blob => {
    //console.log('loaded sticker:', blob, div);
    if(middleware && !middleware()) return;
    
    if(div.firstElementChild) {
      div.firstElementChild.remove();
    }
    
    if(stickerType == 2) {
      const reader = new FileReader();
      
      reader.addEventListener('loadend', async(e) => {
        // @ts-ignore
        const text = e.srcElement.result;
        let json = await CryptoWorker.gzipUncompress<string>(text, true);
        
        let animation = await LottieLoader.loadAnimation({
          container: div,
          loop: false,
          autoplay: false,
          animationData: JSON.parse(json),
          renderer: canvas ? 'canvas' : 'svg'
        }, group);
        
        if(!canvas) {
          div.addEventListener('mouseover', (e) => {
            let animation = LottieLoader.getAnimation(div, group);
            
            if(animation) {
              //console.log('sticker hover', animation, div);
              
              // @ts-ignore
              animation.loop = true;
              
              // @ts-ignore
              if(animation.currentFrame == animation.totalFrames - 1) {
                animation.goToAndPlay(0, true);
              } else {
                animation.play();
              }
              
              div.addEventListener('mouseout', () => {
                // @ts-ignore
                animation.loop = false;
              }, {once: true});
            }
          });
        } /* else {
          let canvas = div.firstElementChild as HTMLCanvasElement;
          if(!canvas.width && !canvas.height) {
            console.log('Need lottie resize');
            
            // @ts-ignore
            animation.resize();
          }
        } */
        
        if(play) {
          animation.play();
        }
      });
      
      reader.readAsArrayBuffer(blob);
    } else if(stickerType == 1) {
      let img = new Image();
      
      appWebpManager.polyfillImage(img, blob);
      
      //img.src = URL.createObjectURL(blob);
      
      /* div.style.height = doc.h + 'px';
      div.style.width = doc.w + 'px'; */
      div.append(img);
    }
    
    div.setAttribute('file-id', doc.id);
    appStickersManager.saveSticker(doc);
  });
  
  return lazyLoadQueue ? (lazyLoadQueue.push({div, load}), Promise.resolve()) : load();
}