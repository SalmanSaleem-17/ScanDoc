package expo.modules.scandoc;

import android.content.Context;
import android.graphics.*;
import android.graphics.pdf.PdfRenderer;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.googlecode.leptonica.android.Pix;
import com.googlecode.tesseract.android.TessBaseAPI;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;
import kotlin.Unit;
import static org.junit.Assert.*;

/** Java keeps instrumentation builds independent of Kotlin's comma-delimited friend paths. */
@RunWith(AndroidJUnit4.class)
public class EngineTest {
  private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
  interface Work { void run(Images images, String uri, File dir) throws Exception; }
  private void clean(File file) { File[] children=file.listFiles(); if(children!=null)for(File child:children)clean(child);file.delete(); }
  private void fixture(Work work) throws Exception {
    File dir=new File(context.getCacheDir(),"test-"+UUID.randomUUID());dir.mkdirs();
    Bitmap bitmap=Bitmap.createBitmap(600,800,Bitmap.Config.ARGB_8888);
    try {
      bitmap.eraseColor(Color.WHITE);Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(Color.BLACK);paint.setTextSize(40);
      new Canvas(bitmap).drawText("SECRET 123456",40,220,paint);
      File source=new File(dir,"source.jpg");try(OutputStream stream=new FileOutputStream(source)){bitmap.compress(Bitmap.CompressFormat.JPEG,100,stream);}
      work.run(new Images(context,dir),Uri.fromFile(source).toString(),dir);
    } finally {bitmap.recycle();clean(dir);}
  }
  @Test public void redactionReplacesPixelsAndPreservesOriginal() throws Exception {
    fixture((images,source,dir)->{
      JSONObject result=images.edit(new JSONObject().put("uri",source).put("redactions",new JSONArray().put(new JSONArray(new double[]{0,.15,1,.25}))));
      Bitmap output=images.load(result.getString("uri"),800), original=images.load(source,800);
      try{assertTrue(Color.red(output.getPixel(300,180))<8);assertTrue(Color.red(original.getPixel(300,180))>240);}finally{output.recycle();original.recycle();}
    });
  }
  @Test public void generatedPdfHasExpectedPagesAndRenders() throws Exception {
    fixture((images,source,dir)->{
      File file=new File(dir,"output.pdf");
      PdfWriter.INSTANCE.write(file,3,index->new PdfWriter.Page(images.file(source),600,800),index->Unit.INSTANCE);
      try(ParcelFileDescriptor fd=ParcelFileDescriptor.open(file,ParcelFileDescriptor.MODE_READ_ONLY);PdfRenderer pdf=new PdfRenderer(fd)){
        assertEquals(3,pdf.getPageCount());try(PdfRenderer.Page page=pdf.openPage(2)){Bitmap b=Bitmap.createBitmap(300,400,Bitmap.Config.ARGB_8888);try{page.render(b,null,null,PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);assertTrue(file.length()>1000);}finally{b.recycle();}}
      }
      String bytes=new String(Files.readAllBytes(file.toPath()),StandardCharsets.ISO_8859_1);
      assertFalse(bytes.contains("/EmbeddedFiles"));assertFalse(bytes.contains("/Font"));assertFalse(bytes.contains("SECRET"));
    });
  }
  @Test public void bookProducesTwoPagesAndComparisonDetectsChanges() throws Exception {
    fixture((images,source,dir)->{
      JSONArray pages=images.book(new JSONObject().put("uri",source).put("split",.5).put("curve",0)).getJSONArray("uris");assertEquals(2,pages.length());
      Bitmap first=images.load(pages.getString(0),1000);try{assertEquals(300,first.getWidth());assertEquals(800,first.getHeight());}finally{first.recycle();}
      assertEquals(0,images.compare(new JSONObject().put("first",source).put("second",source)).getDouble("changedPercent"),.001);
      JSONObject redacted=images.edit(new JSONObject().put("uri",source).put("redactions",new JSONArray().put(new JSONArray(new double[]{0,0,1,1}))));
      assertTrue(images.compare(new JSONObject().put("first",source).put("second",redacted.getString("uri"))).getDouble("changedPercent")>90);
    });
  }
  /** A page as a camera sees it: skewed, and lit unevenly across the sheet. */
  private Bitmap degradedPage(int spin) {
    Bitmap bitmap=Bitmap.createBitmap(1200,1600,Bitmap.Config.ARGB_8888);
    Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.WHITE);
    Paint paint=new Paint(Paint.ANTI_ALIAS_FLAG);paint.setColor(Color.BLACK);paint.setTextSize(58);
    canvas.save();canvas.rotate(spin+4,600,800);
    canvas.drawText("INVOICE 2026",140,400,paint);
    canvas.drawText("Total amount 1234.56",140,520,paint);
    canvas.drawText("Thank you for your business",140,640,paint);
    canvas.restore();
    // A strong lighting gradient is what defeats a single global threshold.
    Paint shade=new Paint();
    shade.setShader(new LinearGradient(0,0,1200,0,Color.argb(0,0,0,0),Color.argb(175,0,0,0),Shader.TileMode.CLAMP));
    canvas.drawRect(0,0,1200,1600,shade);
    return bitmap;
  }
  private File writePage(File dir,String name,int spin) throws Exception {
    Bitmap page=degradedPage(spin);File file=new File(dir,name);
    try(OutputStream stream=new FileOutputStream(file)){page.compress(Bitmap.CompressFormat.JPEG,92,stream);}finally{page.recycle();}
    return file;
  }
  private void installModel(File dir) throws Exception {
    File data=new File(dir,"tessdata");data.mkdirs();
    try(InputStream input=context.getAssets().open("tessdata/eng.traineddata");OutputStream output=new FileOutputStream(new File(data,"eng.traineddata"))){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))>=0)output.write(buffer,0,n);}
  }
  private int found(String text,String... words) {
    if(text==null)return 0;int total=0;String upper=text.toUpperCase();
    for(String word:words)if(upper.contains(word.toUpperCase()))total++;
    return total;
  }
  @Test public void preprocessingBeatsTheRawPhotoOnAnUnevenlyLitSkewedPage() throws Exception {
    File dir=new File(context.getCacheDir(),"ocr-"+UUID.randomUUID());dir.mkdirs();
    try {
      installModel(dir);
      String uri=Uri.fromFile(writePage(dir,"page.jpg",0)).toString();
      Images images=new Images(context,dir);
      String[] words={"INVOICE","Total","amount","business"};
      TessBaseAPI tess=new TessBaseAPI();
      try {
        assertTrue(tess.init(dir.getPath(),"eng"));
        // Previous behaviour: raw photo, library default segmentation, no dpi.
        String before;Bitmap raw=images.load(uri,2400);
        try{tess.setImage(raw);before=tess.getUTF8Text();}finally{raw.recycle();}
        // New behaviour.
        tess.setPageSegMode(Ocr.INSTANCE.pageSegMode("auto"));
        tess.setVariable("user_defined_dpi","300");
        String after;Bitmap clean=images.load(uri,Ocr.ANALYSIS_EDGE);
        Pix prepared;try{prepared=Ocr.INSTANCE.prepare(clean,true);}finally{clean.recycle();}
        try{tess.setImage(prepared);after=tess.getUTF8Text();}finally{prepared.recycle();}
        int rawScore=found(before,words),cleanScore=found(after,words);
        assertTrue("preprocessing lost text. raw="+rawScore+" ["+before+"] clean="+cleanScore+" ["+after+"]",cleanScore>=rawScore);
        assertTrue("preprocessed page should be readable, got: "+after,cleanScore>=3);
      } finally {tess.recycle();}
    } finally {clean(dir);}
  }
  @Test public void upsideDownPagesAreDetectedWithoutOsdData() throws Exception {
    File dir=new File(context.getCacheDir(),"ocr-"+UUID.randomUUID());dir.mkdirs();
    try {
      installModel(dir);
      String uri=Uri.fromFile(writePage(dir,"upside-down.jpg",180)).toString();
      Images images=new Images(context,dir);
      TessBaseAPI tess=new TessBaseAPI();
      try {
        assertTrue(tess.init(dir.getPath(),"eng"));
        tess.setPageSegMode(Ocr.INSTANCE.pageSegMode("auto"));
        tess.setVariable("user_defined_dpi","300");
        Bitmap clean=images.load(uri,Ocr.ANALYSIS_EDGE);
        Pix prepared;try{prepared=Ocr.INSTANCE.prepare(clean,true);}finally{clean.recycle();}
        try {
          // Read as-is the page is nonsense, yet Tesseract still reports high
          // confidence for it, which is why orientation is judged on words.
          tess.setImage(prepared);
          String upright=tess.getUTF8Text();
          assertEquals("an upside-down page should read as nonsense, got: "+upright,0,found(upright,"INVOICE","business"));
          assertTrue("confidence cannot detect a flip; it stayed at "+tess.meanConfidence(),tess.meanConfidence()>65);
          assertTrue("nonsense should contain few ordinary words, got: "+upright,Ocr.INSTANCE.plausibleWords(upright)<3);
          assertTrue("this page must trigger an orientation probe",Ocr.INSTANCE.looksUnreadable(upright,tess.meanConfidence()));
          // The probe must choose a turn that actually reads. Tesseract re-reads
          // sideways text itself, so the exact angle is not asserted.
          int degrees=Ocr.INSTANCE.probeRotation(tess,prepared,()->Unit.INSTANCE);
          assertTrue("expected a correcting rotation, got "+degrees,degrees!=0);
          Pix turned=Ocr.INSTANCE.turn(prepared,degrees);
          assertNotNull(turned);
          try{
            tess.setImage(turned);
            String corrected=tess.getUTF8Text();
            assertEquals("corrected page should read, got: "+corrected,2,found(corrected,"INVOICE","business"));
          }finally{turned.recycle();}
        } finally {prepared.recycle();}
      } finally {tess.recycle();}
    } finally {clean(dir);}
  }
  @Test public void bundledModelRecognizesTextOffline() throws Exception {
    fixture((images,source,dir)->{
      File data=new File(dir,"tessdata");data.mkdirs();
      try(InputStream input=context.getAssets().open("tessdata/eng.traineddata");OutputStream output=new FileOutputStream(new File(data,"eng.traineddata"))){byte[] buffer=new byte[65536];int n;while((n=input.read(buffer))>=0)output.write(buffer,0,n);}
      TessBaseAPI tess=new TessBaseAPI();Bitmap image=images.load(source,1000);
      try{assertTrue(tess.init(dir.getPath(),"eng"));tess.setImage(image);assertTrue(tess.getUTF8Text().contains("SECRET"));}finally{tess.recycle();image.recycle();}
    });
  }
}
