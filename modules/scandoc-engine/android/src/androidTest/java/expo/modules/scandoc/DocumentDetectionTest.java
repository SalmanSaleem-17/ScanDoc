package expo.modules.scandoc;

import android.graphics.Matrix;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.opencv.android.OpenCVLoader;
import org.opencv.core.*;
import org.opencv.imgproc.Imgproc;
import java.util.*;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class DocumentDetectionTest {
  private List<Point> quad() { return Arrays.asList(new Point(.2,.15),new Point(.8,.15),new Point(.8,.85),new Point(.2,.85)); }
  private DetectedPage page(List<Point> p) { return new DetectedPage(p,.94,.42,150,.65,0,.95,true); }
  @Test public void blankFrameDoesNotInventDocument() {
    assertTrue(OpenCVLoader.initLocal());
    Mat frame=new Mat(480,640,CvType.CV_8UC1,new Scalar(160));DocumentDetector detector=new DocumentDetector();
    try { assertNull(detector.detect(frame,null,640)); } finally {frame.release();detector.close();}
  }
  @Test public void detectsAngledPageAndOrdersCorners() {
    assertTrue(OpenCVLoader.initLocal());
    Mat frame=new Mat(480,640,CvType.CV_8UC1,new Scalar(30));
    MatOfPoint polygon=new MatOfPoint(new Point(120,60),new Point(520,85),new Point(490,420),new Point(95,400));
    Imgproc.fillConvexPoly(frame,polygon,new Scalar(220));
    for(int y=125;y<360;y+=25)Imgproc.line(frame,new Point(155,y),new Point(450,y),new Scalar(65),2);
    DocumentDetector detector=new DocumentDetector();
    try {
      DetectedPage result=detector.detect(frame,null,640);assertNotNull(result);
      assertTrue(result.getConfidence()>.70);assertTrue(result.getFullyVisible());
      assertEquals(120.0/640,result.getCorners().get(0).x,.03);
      assertEquals(60.0/480,result.getCorners().get(0).y,.03);
      assertTrue(result.getSharpness()>55);
    } finally {frame.release();polygon.release();detector.close();}
  }
  @Test public void detectsLightPageOnLightDeskAndNarrowReceipt() {
    assertTrue(OpenCVLoader.initLocal());
    for(boolean receipt:new boolean[]{false,true}) {
      Mat frame=new Mat(480,640,CvType.CV_8UC1,new Scalar(210));
      int left=receipt?260:140,right=receipt?380:500;
      Imgproc.rectangle(frame,new Point(left,45),new Point(right,435),new Scalar(239),-1);
      for(int y=90;y<410;y+=25)Imgproc.line(frame,new Point(left+15,y),new Point(right-15,y),new Scalar(90),1);
      DocumentDetector detector=new DocumentDetector();
      try {DetectedPage result=detector.detect(frame,null,640);assertNotNull(result);assertTrue(result.getCoverage()>.1);}
      finally{frame.release();detector.close();}
    }
  }
  @Test public void autoCaptureRequiresHistoryAndRejectsPoorQuality() {
    DocumentTracker tracker=new DocumentTracker();
    assertFalse(tracker.update(page(quad()),1000).getReady());
    TrackingResult last=null;
    for(long t=1100;t<=1900;t+=100)last=tracker.update(page(quad()),t);
    assertTrue(last.getReady());
    DetectedPage dark=new DetectedPage(quad(),.94,.42,150,.1,0,.95,true);
    assertFalse(tracker.update(dark,2000).getReady());
    assertFalse(tracker.update(page(quad()),2100).getReady());
  }
  @Test public void capturedPageCannotRepeatUntilRemoved() {
    DocumentTracker tracker=new DocumentTracker();
    for(long t=1000;t<2200;t+=100)tracker.update(page(quad()),t);
    tracker.captured();
    for(long t=2200;t<4200;t+=100)assertFalse(tracker.update(page(quad()),t).getReady());
    tracker.update(null,4300);tracker.update(null,5100);
    TrackingResult last=null;
    for(long t=5200;t<6500;t+=100)last=tracker.update(page(quad()),t);
    assertTrue(last.getReady());
  }
  @Test public void missedFramePreservesOverlayButRevokesCapture() {
    DocumentTracker tracker=new DocumentTracker();
    for(long t=1000;t<=2000;t+=100)tracker.update(page(quad()),t);
    TrackingResult missed=tracker.update(null,2100);
    assertNotNull(missed.getQuad());assertFalse(missed.getReady());
    assertNull(tracker.update(null,2400).getQuad());
  }
  @Test public void clippingAndMotionBlockAutoCapture() {
    DocumentTracker tracker=new DocumentTracker();
    DetectedPage clipped=new DetectedPage(quad(),.96,.42,150,.65,0,.95,false);
    for(long t=1000;t<3000;t+=100)assertFalse(tracker.update(clipped,t).getReady());
    for(long t=3000;t<5000;t+=100){
      double dx=t%200==0?.03:0;
      List<Point> moved=new ArrayList<>();for(Point p:quad())moved.add(new Point(p.x+dx,p.y));
      assertFalse(tracker.update(page(moved),t).getReady());
    }
  }
  @Test public void stillImageCoordinatesFollowExifRotation() {
    float[] raw={100,50,500,50,500,350,100,350};
    List<Double> portrait=PreviewCoordinates.INSTANCE.uprightNormalized(raw,640,480,90);
    assertNotNull(portrait);
    assertEquals(1-350.0/480,portrait.get(0),.0001);
    assertEquals(100.0/640,portrait.get(1),.0001);
    assertEquals(1-50.0/480,portrait.get(2),.0001);
    assertEquals(500.0/640,portrait.get(5),.0001);
    float[] invalid={-100,50,500,50,500,350,100,350};
    assertNull(PreviewCoordinates.INSTANCE.uprightNormalized(invalid,640,480,90));
  }
  @Test public void transformIncludesRotationCropAndScaling() {
    for(int rotation:new int[]{0,90,180,270}) {
      Matrix sensorBuffer=new Matrix();sensorBuffer.setScale(.25f,.25f);sensorBuffer.postTranslate(-20,-10);
      Matrix sensorPreview=new Matrix();sensorPreview.setRotate(rotation,500,400);sensorPreview.postScale(.8f,.8f);sensorPreview.postTranslate(-70,35);
      float[] sensor={180,140,720,600};float[] buffer=sensor.clone();float[] expected=sensor.clone();
      sensorBuffer.mapPoints(buffer);sensorPreview.mapPoints(expected);
      Matrix actual=PreviewCoordinates.INSTANCE.bufferToPreview(sensorBuffer,sensorPreview);assertNotNull(actual);actual.mapPoints(buffer);
      assertArrayEquals(expected,buffer,.001f);
      Matrix inverse=new Matrix();assertTrue(actual.invert(inverse));inverse.mapPoints(buffer);
      float[] original=sensor.clone();sensorBuffer.mapPoints(original);assertArrayEquals(original,buffer,.001f);
    }
  }
}
